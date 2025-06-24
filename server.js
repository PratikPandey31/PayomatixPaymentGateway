require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const Joi = require('joi');
const morgan = require('morgan'); // Morgan is already added and working!

const app = express();
const port = 3000;

const PAYOMATIX_PUBLIC_KEY = process.env.PAYOMATIX_PUBLIC_KEY;
const PAYOMATIX_SECRET_KEY = process.env.PAYOMATIX_SECRET_KEY;
const MEDICARE_BACKEND_URL = process.env.MEDICARE_BACKEND_URL;
const MEDICARE_INTERNAL_SECRET = process.env.MEDICARE_INTERNAL_SECRET;

const PAYOMATIX_API_URL = 'https://admin.payomatix.com/payment/merchant/transaction';

app.use(helmet());

app.use(morgan('dev'));
app.use(bodyParser.json());

app.use(cors({
    origin:'*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

const paymentSchema = Joi.object({
    amount: Joi.number().positive().precision(2).required().messages({
        'number.base': 'Amount must be a number.',
        'number.positive': 'Amount must be positive.',
        'number.precision': 'Amount must have at most 2 decimal places.',
        'any.required': 'Amount is required.'
    }),
    currency: Joi.string().length(3).uppercase().required().messages({
        'string.base': 'Currency must be a string.',
        'string.length': 'Currency must be 3 characters long (e.g., INR, USD).',
        'string.uppercase': 'Currency must be uppercase.',
        'any.required': 'Currency is required.'
    }),
    customerEmail: Joi.string().email().required().messages({
        'string.base': 'Customer email must be a string.',
        'string.email': 'Customer email must be a valid email address.',
        'any.required': 'Customer email is required.'
    })
});

app.post('/create-payment-intent', async (req, res) => {
    const { error, value } = paymentSchema.validate(req.body, { abortEarly: false });
    if (error) {
        console.error('Validation error for /create-payment-intent:', error.details);
        return res.status(400).json({
            success: false,
            message: 'Invalid request data provided.',
            errors: error.details.map(d => d.message)
        });
    }

    const {
        amount,
        currency,
        customerEmail
    } = value;

    let merchantRef = req.body.merchantRef || `payomatix-merchant-ref-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    let returnUrl = 'https://payomatixpaymentgatewayfrontend.onrender.com/payment-status';
    let notifyUrl = 'https://payomatixpaymentgateway.onrender.com/payomatix-webhook';

    try {
        const payomatixRequestBody = JSON.stringify({
            email: customerEmail.trim(),
            amount: amount.toFixed(2),
            currency: currency.trim(),
            return_url: returnUrl.trim(),
            notify_url: notifyUrl.trim(),
            merchant_ref: merchantRef.trim()
        });

        // Consolidated log for data being sent to Payomatix
        console.log('--- PAYOMATIX API REQUEST ---');
        console.log('URL:', PAYOMATIX_API_URL);
        console.log('Payload:', payomatixRequestBody); // <--- Explicitly printing payload here
        console.log('-----------------------------');


        const payomatixResponse = await fetch(PAYOMATIX_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': PAYOMATIX_SECRET_KEY,
                'Content-Type': 'application/json'
            },
            body: payomatixRequestBody
        });

        const payomatixData = await payomatixResponse.json();

        console.log('Raw Payomatix API response data:', payomatixData);

        if (payomatixData.responseCode === 300 && payomatixData.status === 'redirect') {
            // Explicitly log if redirect URL is received
            console.log('--- REDIRECT URL RECEIVED ---');
            console.log('Payomatix API successful response (redirect):', payomatixData);
            console.log('Redirect URL:', payomatixData.redirect_url); // <--- Explicitly printing redirect_url
            console.log('-----------------------------');


            if (payomatixData.redirect_url) {
                res.json({
                    success: true,
                    message: 'Payment intent created successfully. Redirect URL received.',
                    redirectUrl: payomatixData.redirect_url,
                    transactionId: payomatixData.merchant_ref || payomatixData.transaction_id
                });
            } else {
                console.warn('Payomatix successful redirect response did not contain "redirect_url":', payomatixData);
                res.status(500).json({
                    success: false,
                    message: 'Payment intent created, but redirection URL was not provided by Payomatix. Please check Payomatix API response format.',
                    payomatixResponse: payomatixData
                });
            }
        } else if (payomatixData.responseCode >= 400 || payomatixData.status === 'validation_error') {
            console.error('Error response from Payomatix API:', payomatixData);
            res.status(payomatixResponse.status || 500).json({
                success: false,
                message: 'Failed to create payment intent with Payomatix.',
                error: payomatixData.response || payomatixData.message || 'Unknown error from Payomatix API.',
                payomatixErrors: payomatixData.errors
            });
        } else {
            console.warn('Unexpected but not explicitly erroneous response from Payomatix API:', payomatixData);
            res.status(500).json({
                success: false,
                message: 'Received an unexpected response from Payomatix API.',
                payomatixResponse: payomatixData
            });
        }

    } catch (error) {
        console.error('Server error during payment intent creation:', error);
        res.status(500).json({
            success: false,
            message: 'An internal server error occurred while processing your payment request.',
            error: error.message
        });
    }
});

// THIS IS THE WEBHOOK ROUTE
app.post('/payomatix-webhook', async(req, res) => {
    // --- Forwarding the webhook message to Medicare Backend ---
if (MEDICARE_BACKEND_URL && MEDICARE_INTERNAL_SECRET) {
    try {
        const medicareBackendNotificationUrl = `${MEDICARE_BACKEND_URL}/internal/payment-update`; // This is the new endpoint on Medicare Backend
        console.log(`Received Payomatix webhook, forwarding to Medicare Backend at: ${medicareBackendNotificationUrl}`);
        const forwardPayload = {
            correlationId: correlationId, // Your internal ID for Medicare to identify the transaction
            payomatixId: payomatixTransactionId, // Payomatix's unique transaction ID
            status: status,
            message: message,
            amount: amount,
            currency: currency,
            customerEmail: customerEmail,
            customerName: customerName,
            customerPhone: customerPhone,
            receivedAt: new Date().toISOString() // Timestamp when your Payomatix backend received it
        };

        console.log(`Forwarding webhook to Medicare Backend at: ${medicareBackendNotificationUrl}`);
        console.log('Forwarding Payload:', forwardPayload);

        const forwardResponse = await fetch(medicareBackendNotificationUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': MEDICARE_INTERNAL_SECRET 
            },
            body: JSON.stringify(forwardPayload)
        });

        if (forwardResponse.ok) {
            console.log('Webhook successfully forwarded to Medicare Backend.');
        } else {
            const errorText = await forwardResponse.text();
            console.error(`Failed to forward webhook to Medicare Backend. Status: ${forwardResponse.status}, Response: ${errorText}`);
        }
    } catch (forwardError) {
        console.error('Error forwarding webhook to Medicare Backend:', forwardError.message);
    }
} else {
    console.warn('MEDICARE_BACKEND_URL or MEDICARE_INTERNAL_SECRET not set. Skipping Medicare Backend notification.');
}
// --- End forwarding logic ---
    // Morgan will already show that a POST request came to /payomatix-webhook
    // This console.log will show the body received.
    console.log('--- WEBHOOK RECEIVED ---');
    console.log('Received Payomatix webhook payload:', req.body); // <--- Explicitly printing webhook payload
    console.log('------------------------');

    // --- IMPORTANT: Webhook Verification (still critical for security, even if not fully implemented yet) ---
    // You MUST verify that this webhook actually came from Payomatix and is not a malicious spoof.
    // Consult Payomatix documentation for their signature verification method.
    // --- END Webhook Verification ---

    // Send 200 OK back to Payomatix to acknowledge receipt
    res.status(200).json({ received: true, message: 'Webhook received and processed.' });
});

app.listen(3000, () => {
    console.log(`Payomatix backend server listening at http://localhost:${port}`);
    console.log('----------------------------------------------------');
    console.log('IMPORTANT NOTES:');
    console.log(`1. Your Public Key: ${PAYOMATIX_PUBLIC_KEY ? '****** (loaded)' : 'NOT LOADED! Check .env'}`);
    console.log(`2. Your Secret Key: ${PAYOMATIX_SECRET_KEY ? '****** (loaded)' : 'NOT LOADED! Check .env'}`);
    console.log(`3. Payomatix API URL: ${PAYOMATIX_API_URL}`);
    console.log('4. Ensure your server IPs are whitelisted in Payomatix portal (https://portal.payomatix.com/ip-whitelist)!');
    console.log('5. Implement webhook signature verification in /payomatix-webhook for security (CRITICAL).');
    console.log('6. Use HTTPS for all production traffic (frontend and backend).');
    console.log('----------------------------------------------------');

    if (!PAYOMATIX_PUBLIC_KEY || !PAYOMATIX_SECRET_KEY) {
        console.error('ERROR: Payomatix keys are not loaded from .env! Ensure your .env file is correctly configured.');
    }
});