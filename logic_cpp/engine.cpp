#include <winsock2.h>
#include <windows.h>
#include <iostream>
#include <string>
#include <unordered_map>
#include <fstream>
#include <ctime>

using namespace std;

enum class TxnState {
    INITIATED,
    PENDING,
    CAPTURED,
    FAILED
};

unordered_map<string, TxnState> store;
CRITICAL_SECTION mtx;

string state_to_string(TxnState s) {
    if (s == TxnState::PENDING) return "PENDING";
    if (s == TxnState::CAPTURED) return "CAPTURED";
    if (s == TxnState::FAILED) return "FAILED";
    return "INITIATED";
}

void write_audit_log(const string& txn_id, const string& state, const string& info) {
    ofstream log_file("ledger.log", ios::app);
    if (log_file.is_open()) {
        time_t now = time(0);
        log_file << "[" << now << "] TXN: " << txn_id 
                 << " | STATE: " << state 
                 << " | INFO: " << info << "\n";
    }
}

void recover_from_ledger() {
    ifstream log_file("ledger.log");
    if (!log_file.is_open()) {
        cout << "[C++ Core] WAL Recovery: No existing ledger.log found. Starting fresh." << endl;
        return;
    }

    string line;
    int cnt = 0;
    while (getline(log_file, line)) {
        size_t txn_pos = line.find("TXN: ");
        size_t state_pos = line.find(" | STATE: ");
        size_t info_pos = line.find(" | INFO: ");

        if (txn_pos != string::npos && state_pos != string::npos && info_pos != string::npos) {
            string txn_id = line.substr(txn_pos + 5, state_pos - (txn_pos + 5));
            string state_str = line.substr(state_pos + 10, info_pos - (state_pos + 10));

            if (state_str == "PENDING") store[txn_id] = TxnState::PENDING;
            else if (state_str == "CAPTURED") store[txn_id] = TxnState::CAPTURED;
            else if (state_str == "FAILED") store[txn_id] = TxnState::FAILED;
            else store[txn_id] = TxnState::INITIATED;
            cnt++;
        }
    }
    cout << "[C++ Core] WAL Recovery: Replayed " << cnt << " log entries (" 
         << store.size() << " unique transactions restored in RAM)" << endl;
}

string extract_field(const string& body, const string& key) {
    string search_key = "\"" + key + "\"";
    size_t pos = body.find(search_key);
    if (pos == string::npos) return "";
    pos = body.find(":", pos);
    if (pos == string::npos) return "";
    size_t start = body.find_first_not_of(" \t\n\r\"", pos + 1);
    if (start == string::npos) return "";
    size_t end = body.find_first_of(",}\"\n\r", start);
    return body.substr(start, end - start);
}

void send_json(SOCKET client_socket, int status_code, const string& status_text, const string& json_body) {
    string response = "HTTP/1.1 " + to_string(status_code) + " " + status_text + "\r\n";
    response += "Content-Type: application/json\r\n";
    response += "Content-Length: " + to_string(json_body.length()) + "\r\n";
    response += "Connection: close\r\n\r\n";
    response += json_body;
    send(client_socket, response.c_str(), response.length(), 0);
}

int main() {
    InitializeCriticalSection(&mtx);

    EnterCriticalSection(&mtx);
    recover_from_ledger();
    LeaveCriticalSection(&mtx);

    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);

    SOCKET server_socket = socket(AF_INET, SOCK_STREAM, 0);

    sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(8080);

    bind(server_socket, (sockaddr*)&server_addr, sizeof(server_addr));
    listen(server_socket, SOMAXCONN);

    cout << "C++ Core Engine running on port 8080" << endl;

    while (true) {
        SOCKET client_socket = accept(server_socket, NULL, NULL);
        if (client_socket == INVALID_SOCKET) continue;

        char buffer[4096] = {0};
        int bytes = recv(client_socket, buffer, sizeof(buffer) - 1, 0);
        if (bytes > 0) {
            string req(buffer, bytes);
            size_t header_end = req.find("\r\n\r\n");
            if (header_end != string::npos && header_end + 4 == req.size()) {
                int more = recv(client_socket, buffer, sizeof(buffer) - 1, 0);
                if (more > 0) req.append(buffer, more);
            }

            string body = (header_end != string::npos) ? req.substr(header_end + 4) : req;

            if (req.find("POST /internal/init") != string::npos) {
                string txn_id = extract_field(body, "internal_txn_id");
                string amount = extract_field(body, "amount");

                bool flag = !txn_id.empty();
                if (!flag) {
                    send_json(client_socket, 400, "Bad Request", "{\"error\":\"Missing internal_txn_id\"}");
                } else {
                    EnterCriticalSection(&mtx);
                    store[txn_id] = TxnState::PENDING;
                    write_audit_log(txn_id, "PENDING", "Amount=" + amount);
                    LeaveCriticalSection(&mtx);

                    cout << "[C++ Core] Transaction " << txn_id << " locked in state: PENDING (Amount: " << amount << ")" << endl;

                    string resp_body = "{\"status\":\"PENDING\",\"txn_id\":\"" + txn_id + "\"}";
                    send_json(client_socket, 200, "OK", resp_body);
                }
            } else if (req.find("POST /internal/update") != string::npos) {
                string txn_id = extract_field(body, "internal_txn_id");
                string new_status = extract_field(body, "status");

                EnterCriticalSection(&mtx);
                if (store.find(txn_id) == store.end()) {
                    LeaveCriticalSection(&mtx);
                    send_json(client_socket, 404, "Not Found", "{\"error\":\"Transaction ID not found\"}");
                } else if (store[txn_id] != TxnState::PENDING) {
                    string curr = state_to_string(store[txn_id]);
                    LeaveCriticalSection(&mtx);
                    cout << "[C++ Core] Rejected invalid transition for " << txn_id << " (Already " << curr << ")" << endl;
                    send_json(client_socket, 409, "Conflict", "{\"error\":\"Transaction already in terminal state: " + curr + "\"}");
                } else {
                    store[txn_id] = (new_status == "CAPTURED") ? TxnState::CAPTURED : TxnState::FAILED;
                    string updated = state_to_string(store[txn_id]);
                    write_audit_log(txn_id, updated, "Transitioned from PENDING");
                    LeaveCriticalSection(&mtx);

                    cout << "[C++ Core] State Transition: " << txn_id << " moved PENDING -> " << updated << endl;
                    send_json(client_socket, 200, "OK", "{\"status\":\"" + updated + "\",\"txn_id\":\"" + txn_id + "\"}");
                }
            } else if (req.find("POST /internal/status") != string::npos) {
                string txn_id = extract_field(body, "internal_txn_id");

                EnterCriticalSection(&mtx);
                if (store.find(txn_id) == store.end()) {
                    LeaveCriticalSection(&mtx);
                    send_json(client_socket, 404, "Not Found", "{\"error\":\"Transaction ID not found\"}");
                } else {
                    string curr = state_to_string(store[txn_id]);
                    LeaveCriticalSection(&mtx);
                    send_json(client_socket, 200, "OK", "{\"status\":\"" + curr + "\",\"txn_id\":\"" + txn_id + "\"}");
                }
            } else {
                send_json(client_socket, 404, "Not Found", "{\"error\":\"Route not found\"}");
            }
        }
        closesocket(client_socket);
    }

    closesocket(server_socket);
    WSACleanup();
    DeleteCriticalSection(&mtx);
    return 0;
}