const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'upi_super_secret_key_2026';
try {
    const envPath = path.join(__dirname, '..', 'gateway_node', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^WEBHOOK_SECRET=(.+)$/m);
        if (match && match[1]) WEBHOOK_SECRET = match[1].trim();
    }
} catch (e) {}

const PORT = 4000;
const GATEWAY_URL = 'http://127.0.0.1:3000';

const htmlPage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Pay UPI Checkout & NPCI Switch</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --g-blue: #4285F4;
            --g-blue-dark: #1a73e8;
            --g-red: #EA4335;
            --g-yellow: #FBBC05;
            --g-green: #34A853;
            --g-surface: #f8f9fa;
            --g-text: #202124;
            --g-subtext: #5f6368;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: radial-gradient(circle at 15% 15%, #1e293b 0%, #090d16 100%);
            color: var(--g-text);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 28px 20px;
        }
        .top-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            color: #e2e8f0;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .top-bar .dot {
            width: 10px; height: 10px; border-radius: 50%;
            background: var(--g-green);
            box-shadow: 0 0 12px var(--g-green);
        }
        .top-bar span {
            font-size: 0.85rem;
            background: rgba(255,255,255,0.07);
            border: 1px solid rgba(255,255,255,0.12);
            padding: 5px 12px;
            border-radius: 999px;
            color: #94a3b8;
            font-family: 'JetBrains Mono', monospace;
        }
        .workspace {
            display: grid;
            grid-template-columns: 420px 480px;
            gap: 28px;
            max-width: 940px;
            width: 100%;
            align-items: start;
        }
        @media (max-width: 920px) {
            .workspace { grid-template-columns: 1fr; max-width: 460px; }
        }

        /* LEFT: GOOGLE PAY CHECKOUT MODAL */
        .checkout-modal {
            background: #ffffff;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.1);
            position: relative;
        }
        .gpay-color-bar {
            height: 6px;
            width: 100%;
            background: linear-gradient(90deg, 
                var(--g-blue) 0% 25%, 
                var(--g-red) 25% 50%, 
                var(--g-yellow) 50% 75%, 
                var(--g-green) 75% 100%);
        }
        .gpay-header {
            background: linear-gradient(135deg, var(--g-blue-dark) 0%, var(--g-blue) 100%);
            color: #fff;
            padding: 22px 24px;
            position: relative;
            overflow: hidden;
        }
        .gpay-header::after {
            content: '';
            position: absolute;
            right: -30px; top: -30px;
            width: 130px; height: 130px;
            background: rgba(255,255,255,0.08);
            border-radius: 50%;
        }
        .merchant-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        .merchant-brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .merchant-logo {
            width: 42px; height: 42px;
            border-radius: 50%;
            background: #ffffff;
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 800;
            font-size: 1.25rem;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.18);
            background-image: conic-gradient(
                var(--g-red) 0deg 90deg,
                var(--g-yellow) 90deg 180deg,
                var(--g-green) 180deg 270deg,
                var(--g-blue) 270deg 360deg
            );
            padding: 3px;
        }
        .merchant-logo-inner {
            width: 100%;
            height: 100%;
            background: #fff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--g-blue-dark);
        }
        .merchant-info h3 {
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 1.12rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .verified-pill {
            font-size: 0.68rem;
            background: rgba(52, 168, 83, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.35);
            color: #ffffff;
            padding: 2px 8px;
            border-radius: 99px;
            font-weight: 600;
        }
        .amount-banner {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            background: rgba(255, 255, 255, 0.14);
            border: 1px solid rgba(255, 255, 255, 0.24);
            padding: 12px 16px;
            border-radius: 12px;
        }
        .amount-banner .lbl {
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #e8f0fe;
            font-weight: 600;
        }
        .amount-banner .val {
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 1.55rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            color: #ffffff;
        }

        .checkout-body {
            padding: 22px 24px 24px;
        }
        .section-title {
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--g-subtext);
            margin-bottom: 10px;
        }

        /* GPay / UPI App Grid */
        .upi-apps {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 18px;
        }
        .app-pill {
            border: 1.5px solid #dadce0;
            border-radius: 12px;
            padding: 10px 6px;
            text-align: center;
            cursor: pointer;
            transition: all 0.15s ease;
            background: var(--g-surface);
        }
        .app-pill:hover {
            border-color: var(--g-blue);
            background: #f1f3f4;
        }
        .app-pill.active {
            border-color: var(--g-blue-dark);
            background: #e8f0fe;
            box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.15);
        }
        .app-icon {
            width: 30px; height: 30px;
            border-radius: 8px;
            margin: 0 auto 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 0.8rem;
            color: #fff;
        }
        .gpay-ic { background: linear-gradient(135deg, var(--g-blue), var(--g-green), var(--g-yellow), var(--g-red)); }
        .phonepe-ic { background: #5f259f; }
        .paytm-ic { background: #00baf2; }
        .bhim-ic { background: #f97316; }
        .app-pill span {
            display: block;
            font-size: 0.73rem;
            font-weight: 600;
            color: var(--g-text);
        }

        /* Form Controls */
        .field-group { margin-bottom: 14px; }
        .field-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--g-text);
            margin-bottom: 6px;
        }
        .input-box {
            width: 100%;
            padding: 11px 13px;
            border: 1.5px solid #dadce0;
            border-radius: 10px;
            font-size: 0.92rem;
            font-family: inherit;
            color: var(--g-text);
            outline: none;
            transition: border 0.15s, box-shadow 0.15s;
        }
        .input-box:focus {
            border-color: var(--g-blue-dark);
            box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.18);
        }
        .vpa-chips {
            display: flex;
            gap: 6px;
            margin-top: 7px;
            flex-wrap: wrap;
        }
        .chip {
            font-size: 0.72rem;
            font-weight: 600;
            padding: 4px 9px;
            border-radius: 99px;
            background: var(--g-surface);
            color: var(--g-subtext);
            cursor: pointer;
            border: 1px solid #dadce0;
            transition: 0.15s;
        }
        .chip:hover {
            background: #e8f0fe;
            color: var(--g-blue-dark);
            border-color: #d2e3fc;
        }
        .row-2 {
            display: grid;
            grid-template-columns: 1fr 1.25fr;
            gap: 10px;
        }
        .regen-btn {
            background: none;
            border: none;
            color: var(--g-blue-dark);
            font-size: 0.73rem;
            font-weight: 700;
            cursor: pointer;
            padding: 0;
        }
        .regen-btn:hover { text-decoration: underline; }

        .gpay-submit {
            width: 100%;
            margin-top: 8px;
            padding: 14px;
            border: none;
            border-radius: 999px;
            background: var(--g-blue-dark);
            color: #fff;
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 0.98rem;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 6px 18px rgba(26, 115, 232, 0.35);
            transition: transform 0.12s, background 0.15s;
        }
        .gpay-submit:hover { background: #1557b0; transform: translateY(-1px); }
        .gpay-submit:active { transform: translateY(0); }

        /* GPay State Overlay Views */
        .state-screen {
            display: none;
            text-align: center;
            padding: 18px 8px 8px;
        }
        .state-screen.active { display: block; }
        .pulse-ring {
            width: 68px; height: 68px;
            border-radius: 50%;
            margin: 0 auto 16px;
            border: 4px solid #e8f0fe;
            border-top-color: var(--g-blue);
            border-right-color: var(--g-red);
            border-bottom-color: var(--g-yellow);
            border-left-color: var(--g-green);
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .status-circle {
            width: 68px; height: 68px;
            border-radius: 50%;
            margin: 0 auto 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            color: #fff;
            font-weight: bold;
        }
        .status-circle.ok { background: var(--g-green); box-shadow: 0 10px 25px rgba(52, 168, 83, 0.35); }
        .status-circle.fail { background: var(--g-red); box-shadow: 0 10px 25px rgba(234, 67, 53, 0.35); }

        .receipt-card {
            background: var(--g-surface);
            border: 1px solid #dadce0;
            border-radius: 12px;
            padding: 12px 14px;
            margin: 16px 0;
            text-align: left;
            font-size: 0.8rem;
        }
        .receipt-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            color: var(--g-subtext);
        }
        .receipt-row strong {
            color: var(--g-text);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.76rem;
        }
        .outline-btn {
            background: var(--g-surface);
            color: var(--g-text);
            border: 1px solid #dadce0;
            width: 100%;
            padding: 11px;
            border-radius: 999px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 6px;
        }
        .outline-btn:hover { background: #e8eaed; }

        .gpay-footer {
            background: var(--g-surface);
            border-top: 1px solid #dadce0;
            padding: 11px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.72rem;
            color: var(--g-subtext);
            font-weight: 600;
        }

        /* RIGHT: NPCI SWITCH & WEBHOOK CONSOLE */
        .npci-console {
            background: rgba(15, 23, 42, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 20px;
            padding: 24px;
            color: #f8fafc;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(16px);
        }
        .console-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 14px;
            margin-bottom: 18px;
        }
        .console-header h2 {
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 1.05rem;
            color: #f8fafc;
        }
        .console-header p {
            font-size: 0.76rem;
            color: #94a3b8;
            margin-top: 2px;
        }
        .live-badge {
            padding: 5px 12px;
            border-radius: 999px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.04em;
            background: #334155;
            color: #cbd5e1;
        }
        .live-badge.PENDING { background: rgba(251, 188, 5, 0.2); color: #fde047; border: 1px solid rgba(251, 188, 5, 0.4); }
        .live-badge.CAPTURED { background: rgba(52, 168, 83, 0.2); color: #86efac; border: 1px solid rgba(52, 168, 83, 0.4); }
        .live-badge.FAILED { background: rgba(234, 67, 53, 0.2); color: #fca5a5; border: 1px solid rgba(234, 67, 53, 0.4); }

        .txn-strip {
            background: #090d16;
            border: 1px solid #1e293b;
            border-radius: 10px;
            padding: 10px 13px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.78rem;
            color: #38bdf8;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .action-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 12px;
        }
        .act-btn {
            padding: 12px;
            border-radius: 10px;
            border: 1px solid transparent;
            font-weight: 600;
            font-size: 0.82rem;
            cursor: pointer;
            transition: 0.15s;
            text-align: left;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .act-btn span { font-size: 0.7rem; opacity: 0.8; font-weight: 400; }
        .btn-cap {
            background: rgba(52, 168, 83, 0.18);
            border-color: rgba(52, 168, 83, 0.4);
            color: #86efac;
        }
        .btn-cap:hover { background: rgba(52, 168, 83, 0.3); }
        .btn-fail {
            background: rgba(234, 67, 53, 0.18);
            border-color: rgba(234, 67, 53, 0.4);
            color: #fca5a5;
        }
        .btn-fail:hover { background: rgba(234, 67, 53, 0.3); }

        .sec-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 18px;
        }
        .btn-sec {
            background: rgba(251, 188, 5, 0.14);
            border: 1px solid rgba(251, 188, 5, 0.35);
            color: #fde047;
        }
        .btn-sec:hover { background: rgba(251, 188, 5, 0.25); }
        .btn-idem {
            background: rgba(66, 133, 244, 0.16);
            border: 1px solid rgba(66, 133, 244, 0.4);
            color: #bfdbfe;
        }
        .btn-idem:hover { background: rgba(66, 133, 244, 0.28); }

        .telemetry-box {
            background: #090d16;
            border: 1px solid #1e293b;
            border-radius: 12px;
            padding: 14px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.76rem;
            color: #e2e8f0;
            max-height: 250px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            line-height: 1.5;
        }
        .telemetry-head {
            display: flex;
            justify-content: space-between;
            font-size: 0.72rem;
            color: #94a3b8;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
        }
    </style>
</head>
<body>

    <div class="top-bar">
        <div class="dot"></div>
        <strong>UPI Microservices Sandbox</strong>
        <span>Node Gateway :3000 &rarr; C++ Core :8080</span>
    </div>

    <div class="workspace">
        <!-- LEFT CARD: GOOGLE PAY CHECKOUT -->
        <div class="checkout-modal">
            <div class="gpay-color-bar"></div>
            <div class="gpay-header">
                <div class="merchant-row">
                    <div class="merchant-brand">
                        <div class="merchant-logo">
                            <div class="merchant-logo-inner">G</div>
                        </div>
                        <div class="merchant-info">
                            <h3>Apex Store <span class="verified-pill">&#10003; Verified</span></h3>
                        </div>
                    </div>
                </div>
                <div class="amount-banner">
                    <div>
                        <div class="lbl">Total Payable</div>
                        <div class="val" id="headerAmount">&#8377;1,500.00</div>
                    </div>
                    <div style="text-align:right; font-size:0.75rem; color:#e8f0fe;">
                        <div>Currency: INR</div>
                        <div id="headerOrderKey" style="font-family:'JetBrains Mono',monospace; color:#ffffff; font-weight:600;">order_901</div>
                    </div>
                </div>
            </div>

            <div class="checkout-body">
                <!-- VIEW 1: CHECKOUT FORM -->
                <div id="formScreen" class="state-screen active" style="text-align:left; padding:0;">
                    <div class="section-title">Select UPI App</div>
                    <div class="upi-apps">
                        <div class="app-pill active" onclick="selectApp(this, '@okaxis')">
                            <div class="app-icon gpay-ic">G</div>
                            <span>GPay</span>
                        </div>
                        <div class="app-pill" onclick="selectApp(this, '@ybl')">
                            <div class="app-icon phonepe-ic">&#8377;</div>
                            <span>PhonePe</span>
                        </div>
                        <div class="app-pill" onclick="selectApp(this, '@paytm')">
                            <div class="app-icon paytm-ic">P</div>
                            <span>Paytm</span>
                        </div>
                        <div class="app-pill" onclick="selectApp(this, '@upi')">
                            <div class="app-icon bhim-ic">B</div>
                            <span>BHIM</span>
                        </div>
                    </div>

                    <div class="field-group">
                        <div class="field-label">
                            <span>UPI ID / VPA</span>
                            <span style="color:var(--g-green); font-size:0.72rem;">&#9679; Instant Verification</span>
                        </div>
                        <input id="vpa" class="input-box" value="sagnik@okaxis" placeholder="username@bank" />
                        <div class="vpa-chips">
                            <span class="chip" onclick="setHandle('@okaxis')">@okaxis</span>
                            <span class="chip" onclick="setHandle('@okicici')">@okicici</span>
                            <span class="chip" onclick="setHandle('@oksbi')">@oksbi</span>
                            <span class="chip" onclick="setHandle('@ybl')">@ybl</span>
                        </div>
                    </div>

                    <div class="row-2">
                        <div class="field-group">
                            <div class="field-label"><span>Amount (&#8377;)</span></div>
                            <input id="amount" type="number" class="input-box" value="1500" oninput="syncAmount()" />
                        </div>
                        <div class="field-group">
                            <div class="field-label">
                                <span>Order Key</span>
                                <button class="regen-btn" onclick="newOrderKey()">+ New Order</button>
                            </div>
                            <input id="idemKey" class="input-box" style="font-family:'JetBrains Mono',monospace; font-size:0.82rem;" value="order_901" oninput="syncAmount()" />
                        </div>
                    </div>

                    <button class="gpay-submit" onclick="initiatePayment()">
                        <span>Pay &#8377;<span id="btnAmount">1,500</span> with GPay</span>
                        <span>&rarr;</span>
                    </button>
                </div>

                <!-- VIEW 2: GPAY PENDING / POLLING SCREEN -->
                <div id="pendingScreen" class="state-screen">
                    <div class="pulse-ring"></div>
                    <h3 style="font-family:'Plus Jakarta Sans',sans-serif; font-size:1.1rem; color:var(--g-text);">Approve Payment on GPay</h3>
                    <p style="font-size:0.82rem; color:var(--g-subtext); margin-top:6px;">
                        Open your UPI app or use the <strong>NPCI Bank Simulator</strong> on the right to settle this transaction.
                    </p>
                    <div class="receipt-card">
                        <div class="receipt-row"><span>Transaction ID</span><strong id="pendTxnId">...</strong></div>
                        <div class="receipt-row"><span>Customer VPA</span><strong id="pendVpa">...</strong></div>
                        <div class="receipt-row"><span>State Machine</span><strong style="color:var(--g-yellow);">PENDING (Locked in C++)</strong></div>
                    </div>
                    <button class="outline-btn" onclick="resetCheckout(false)">&larr; Back to Checkout (Test Replay / New)</button>
                </div>

                <!-- VIEW 3: GPAY CAPTURED / FAILED RECEIPT -->
                <div id="finalScreen" class="state-screen">
                    <div id="finalIcon" class="status-circle ok">&#10003;</div>
                    <h3 id="finalTitle" style="font-family:'Plus Jakarta Sans',sans-serif; font-size:1.2rem;">Paid &#8377;1,500.00</h3>
                    <p id="finalSub" style="font-size:0.8rem; color:var(--g-subtext); margin-top:4px;">Verified via HMAC-SHA256 &amp; C++ WAL Ledger</p>
                    <div class="receipt-card">
                        <div class="receipt-row"><span>Transaction ID</span><strong id="finalTxnId">...</strong></div>
                        <div class="receipt-row"><span>Idempotency Key</span><strong id="finalIdem">...</strong></div>
                        <div class="receipt-row"><span>Final State</span><strong id="finalStateTxt">CAPTURED</strong></div>
                    </div>
                    <button class="gpay-submit" onclick="resetCheckout(true)">+ Start New UPI Payment</button>
                </div>
            </div>

            <div class="gpay-footer">
                <span>&#128274; 256-Bit HMAC Secured</span>
                <span>Google Pay UPI Core</span>
            </div>
        </div>

        <!-- RIGHT CARD: NPCI BANK SWITCH & SECURITY TELEMETRY -->
        <div class="npci-console">
            <div class="console-header">
                <div>
                    <h2>NPCI Switch &amp; Webhook Workbench</h2>
                    <p>Simulate asynchronous bank callbacks &amp; security attacks</p>
                </div>
                <span id="liveBadge" class="live-badge">IDLE</span>
            </div>

            <div class="txn-strip">
                <span style="color:#94a3b8;">Active TXN:</span>
                <span id="activeTxnDisplay">None (Initiate checkout first)</span>
            </div>

            <div class="section-title" style="color:#94a3b8;">1. Authentic Bank Callbacks (Valid HMAC-SHA256)</div>
            <div class="action-grid">
                <button class="act-btn btn-cap" onclick="sendWebhook('CAPTURED', false)">
                    <strong>&#10003; Approve Payment</strong>
                    <span>Transition PENDING &rarr; CAPTURED</span>
                </button>
                <button class="act-btn btn-fail" onclick="sendWebhook('FAILED', false)">
                    <strong>&#10005; Decline Payment</strong>
                    <span>Transition PENDING &rarr; FAILED</span>
                </button>
            </div>

            <div class="section-title" style="color:#94a3b8;">2. Security &amp; Fault-Tolerance Tests</div>
            <div class="sec-grid">
                <button class="act-btn btn-sec" onclick="sendWebhook('CAPTURED', true)">
                    <strong>&#9888; Inject Forged HMAC</strong>
                    <span>Expect HTTP 401 Unauthorized</span>
                </button>
                <button class="act-btn btn-idem" onclick="initiatePayment()">
                    <strong>&#128257; Replay Same Order Key</strong>
                    <span>Expect HTTP 409 Duplicate Block</span>
                </button>
            </div>

            <div class="telemetry-head">
                <span>Live Gateway / C++ Telemetry</span>
                <span id="httpStatusPill" style="color:#38bdf8;">READY</span>
            </div>
            <div class="telemetry-box" id="telemetryLog">// Initiate a UPI payment on the left to inspect live HTTP headers, HMAC-SHA256 signatures, and C++ state transitions...</div>
        </div>
    </div>

    <script>
        let currentTxnId = '';
        let pollTimer = null;

        function syncAmount() {
            const raw = Number(document.getElementById('amount').value || 0);
            const formatted = raw.toLocaleString('en-IN');
            document.getElementById('headerAmount').textContent = '₹' + formatted + '.00';
            document.getElementById('btnAmount').textContent = formatted;
            document.getElementById('headerOrderKey').textContent = document.getElementById('idemKey').value;
        }

        function setHandle(handle) {
            const input = document.getElementById('vpa');
            const base = input.value.split('@')[0] || 'customer';
            input.value = base + handle;
        }

        function selectApp(el, handle) {
            document.querySelectorAll('.app-pill').forEach(p => p.classList.remove('active'));
            el.classList.add('active');
            setHandle(handle);
        }

        function newOrderKey() {
            const rand = Math.floor(100 + Math.random() * 900);
            document.getElementById('idemKey').value = 'order_' + rand;
            syncAmount();
        }

        function showScreen(screenId) {
            ['formScreen', 'pendingScreen', 'finalScreen'].forEach(id => {
                document.getElementById(id).classList.remove('active');
            });
            document.getElementById(screenId).classList.add('active');
        }

        function resetCheckout(generateFreshOrder) {
            if (generateFreshOrder) newOrderKey();
            showScreen('formScreen');
        }

        function logTelemetry(title, status, payloadObj, extraHeader) {
            const pill = document.getElementById('httpStatusPill');
            pill.textContent = 'HTTP ' + status;
            pill.style.color = (status >= 200 && status < 300) ? '#4ade80' : '#f87171';

            let out = '=== ' + title + ' (HTTP ' + status + ') ===\\n';
            if (extraHeader) out += extraHeader + '\\n';
            out += JSON.stringify(payloadObj, null, 2);
            document.getElementById('telemetryLog').textContent = out;
        }

        async function initiatePayment() {
            const amount = Number(document.getElementById('amount').value);
            const customer_vpa = document.getElementById('vpa').value;
            const idempotency_key = document.getElementById('idemKey').value;

            try {
                const res = await fetch('${GATEWAY_URL}/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount, currency: 'INR', idempotency_key, customer_vpa })
                });
                const data = await res.json();
                logTelemetry('POST /checkout', res.status, data, 'Idempotency-Key: ' + idempotency_key);

                if (res.status === 202 && data.transaction_id) {
                    currentTxnId = data.transaction_id;
                    document.getElementById('activeTxnDisplay').textContent = currentTxnId;
                    document.getElementById('pendTxnId').textContent = currentTxnId;
                    document.getElementById('pendVpa').textContent = customer_vpa;
                    showScreen('pendingScreen');
                    startPolling(currentTxnId);
                }
            } catch (err) {
                logTelemetry('NETWORK ERROR', 500, { error: err.message });
            }
        }

        function startPolling(txnId) {
            if (pollTimer) clearInterval(pollTimer);
            pollStatus(txnId);
            pollTimer = setInterval(() => pollStatus(txnId), 1200);
        }

        async function pollStatus(txnId) {
            try {
                const res = await fetch('${GATEWAY_URL}/status/' + txnId);
                const data = await res.json();
                if (data.status) {
                    const badge = document.getElementById('liveBadge');
                    badge.textContent = data.status;
                    badge.className = 'live-badge ' + data.status;

                    if (data.status === 'CAPTURED' || data.status === 'FAILED') {
                        clearInterval(pollTimer);
                        renderFinalReceipt(data.status);
                    }
                }
            } catch (e) {}
        }

        function renderFinalReceipt(status) {
            const icon = document.getElementById('finalIcon');
            const title = document.getElementById('finalTitle');
            const amt = Number(document.getElementById('amount').value).toLocaleString('en-IN');

            if (status === 'CAPTURED') {
                icon.className = 'status-circle ok';
                icon.innerHTML = '&#10003;';
                title.textContent = 'Paid ₹' + amt + '.00';
            } else {
                icon.className = 'status-circle fail';
                icon.innerHTML = '&#10005;';
                title.textContent = 'Payment Declined';
            }

            document.getElementById('finalTxnId').textContent = currentTxnId;
            document.getElementById('finalIdem').textContent = document.getElementById('idemKey').value;
            document.getElementById('finalStateTxt').textContent = status;
            showScreen('finalScreen');
        }

        async function sendWebhook(status, forge) {
            if (!currentTxnId) {
                logTelemetry('WEBHOOK SKIPPED', 400, { error: 'Initiate a payment on the left card first!' });
                return;
            }
            const res = await fetch('/simulate-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction_id: currentTxnId, status, forge })
            });
            const data = await res.json();
            logTelemetry(
                forge ? 'POST /webhook (FORGED SIGNATURE)' : 'POST /webhook (BANK CALLBACK)',
                res.status,
                data.response,
                'x-webhook-signature: ' + data.signature
            );
            pollStatus(currentTxnId);
        }
    </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(htmlPage);
    }

    if (req.method === 'POST' && req.url === '/simulate-webhook') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { transaction_id, status, forge } = JSON.parse(body);
                const payload = JSON.stringify({ transaction_id, status });
                const secretToUse = forge ? 'hacker_fake_secret_key' : WEBHOOK_SECRET;

                const signature = crypto
                    .createHmac('sha256', secretToUse)
                    .update(payload)
                    .digest('hex');

                const gwRes = await fetch(`${GATEWAY_URL}/webhook`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-webhook-signature': signature
                    },
                    body: payload
                });

                const gwData = await gwRes.json();
                res.writeHead(gwRes.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ signature, response: gwData }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ signature: 'none', response: { error: err.message } }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`Google Pay UI & Bank Switch running at http://127.0.0.1:${PORT}`);
});