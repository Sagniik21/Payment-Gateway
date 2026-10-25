const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const idempotencyCache = new Set();
const CPP_ENGINE_URL = process.env.CPP_ENGINE_URL || 'http://127.0.0.1:8080';

app.post('/checkout', async (req, res) => {
    const { amount, currency, idempotency_key, customer_vpa } = req.body;

    if (!idempotency_key || !amount) {
        return res.status(400).json({ error: "Missing required fields: amount or idempotency_key" });
    }

    // 1. Check if this payment request was already sent
    if (idempotencyCache.has(idempotency_key)) {
        console.log(`[Gateway] Blocked duplicate request for key: ${idempotency_key}`);
        return res.status(409).json({ 
            error: "Duplicate request. Payment already processing for this key." 
        });
    }
    
    // 2. Lock the key so it cannot be used again
    idempotencyCache.add(idempotency_key);

    // 3. Generate an internal transaction ID for our C++ engine
    const internal_txn_id = `txn_${uuidv4()}`;

    try {
        console.log(`[Gateway] Initiating transaction: ${internal_txn_id} for amount: ${amount}`);
        
        // 4. Forward transaction to the C++ Core Engine over TCP port 8080
        const cppResponse = await axios.post(`${CPP_ENGINE_URL}/internal/init`, {
            internal_txn_id: internal_txn_id,
            amount: String(amount),
            currency: currency || "INR",
            customer_vpa: customer_vpa || "user@upi"
        });

        console.log(`[Gateway] C++ Core locked state:`, cppResponse.data);

        res.status(202).json({
            message: "Payment initiated",
            transaction_id: internal_txn_id,
            status: cppResponse.data.status
        });

    } catch (error) {
        console.error(`[Gateway] Error communicating with C++ Core:`, error.message);
        idempotencyCache.delete(idempotency_key); // Unlock on failure so user can retry
        res.status(500).json({ error: "Internal Server Error: Core Engine unreachable" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});