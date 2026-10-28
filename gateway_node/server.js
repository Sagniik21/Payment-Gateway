const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const idempotencyCache = new Set();
const CPP_ENGINE_URL = process.env.CPP_ENGINE_URL || 'http://127.0.0.1:8080';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'upi_super_secret_key_2026';

app.post('/checkout', async (req, res) => {
    const { amount, currency, idempotency_key, customer_vpa } = req.body;

    if (!idempotency_key || !amount) {
        return res.status(400).json({ error: "Missing required fields: amount or idempotency_key" });
    }

    if (idempotencyCache.has(idempotency_key)) {
        console.log(`[Gateway] Blocked duplicate request for key: ${idempotency_key}`);
        return res.status(409).json({ 
            error: "Duplicate request. Payment already processing for this key." 
        });
    }
    
    idempotencyCache.add(idempotency_key);
    const internal_txn_id = `txn_${uuidv4()}`;

    try {
        console.log(`[Gateway] Initiating transaction: ${internal_txn_id} for amount: ${amount}`);
        
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
        idempotencyCache.delete(idempotency_key);
        res.status(500).json({ error: "Internal Server Error: Core Engine unreachable" });
    }
});

app.post('/webhook', async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const payload = JSON.stringify(req.body);

    const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

    if (!signature || signature !== expectedSignature) {
        console.warn(`[Webhook] Security Alert: Rejected forged webhook signature!`);
        return res.status(401).json({ error: "Unauthorized: Invalid HMAC signature" });
    }

    const { transaction_id, status } = req.body;
    if (!transaction_id || !status) {
        return res.status(400).json({ error: "Missing transaction_id or status" });
    }

    try {
        console.log(`[Webhook] Verified bank callback for ${transaction_id} -> ${status}`);
        const cppResponse = await axios.post(`${CPP_ENGINE_URL}/internal/update`, {
            internal_txn_id: transaction_id,
            status: status
        });

        res.status(200).json({
            message: "Webhook processed successfully",
            data: cppResponse.data
        });
    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        res.status(500).json({ error: "Failed to update C++ Core Engine" });
    }
});

app.get('/status/:txn_id', async (req, res) => {
    const { txn_id } = req.params;
    try {
        const cppResponse = await axios.post(`${CPP_ENGINE_URL}/internal/status`, {
            internal_txn_id: txn_id
        });
        res.status(200).json(cppResponse.data);
    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        res.status(500).json({ error: "Failed to query C++ Core Engine" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});