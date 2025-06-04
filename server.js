// Load environment variables from .env file
require('dotenv').config(); 
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet'); // For basic security headers
const Joi = require('joi'); // For robust input validation

const app = express();
const port = process.env.PORT || 3000;

// --- Configuration ---
// IMPORTANT: Retrieve these from environment variables for production!
const PAYOMATIX_PUBLIC_KEY = process.env.PAYOMATIX_PUBLIC_KEY;
const PAYOMATIX_SECRET_KEY = process.env.PAYOMATIX_SECRET_KEY;

// The user has explicitly stated this as the API endpoint for direct transactions.
// However, based on the provided documentation, this URL is specified for *TEST* transactions.
// It is CRITICAL to VERIFY THE CORRECT PRODUCTION API ENDPOINT with Payomatix support or their full documentation.
const PAYOMATIX_API_URL = process.env.PAYOMATIX_API_URL || 'https://admin.payomatix.com/payment/merchant/transaction';

// --- Middleware ---
// Apply Helmet for basic security headers
app.use(helmet());

// Parse JSON bodies for incoming requests
app.use(bodyParser.json());

// Configure CORS for production: Allow only specific origins
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- Joi Schema for Input Validation ---
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
    }),
    returnUrl: Joi.string().uri().required().messages({
        'string.base': 'Return URL must be a string.',
        'string.uri': 'Return URL must be a valid URI.',
        'any.required': 'Return URL is required.'
    }),
    notifyUrl: Joi.string().uri().required().messages({
        'string.base': 'Notify URL must be a string.',
        'string.uri': 'Notify URL must be a valid URI.',
        'any.required': 'Notify URL is required.'
    }),
    description: Joi.string().max(255).optional(),
    customerName: Joi.string().max(100).optional(),
    merchantRef: Joi.string().max(50).required().messages({
    'string.base': 'Merchant reference must be a string.',
    'any.required': 'Merchant reference is required.',
    'string.max': 'Merchant reference must not exceed 50 characters.'
}),
    address: Joi.string().max(255).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    zip: Joi.string().max(20).optional(),
    country: Joi.string().length(2).uppercase().optional(),
    phone: Joi.string().max(20).optional(),
    metadata: Joi.object().optional()
});

// --- Routes ---
app.post('/create-payment-intent', async (req, res) => {
    console.log('Received request to create payment intent:', req.body);

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
        description,
        customerEmail,
        customerName,
        merchantRef,
        returnUrl,
        notifyUrl,
        address,
        city,
        state,
        zip,
        country,
        phone,
        metadata
    } = value;

    let firstName = '';
    let lastName = '';
    if (customerName) {
        const nameParts = customerName.split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
    }

    try {
        const payomatixRequestBody = {
            email: customerEmail,
            amount: amount.toFixed(2),
            currency: currency,
            return_url: returnUrl,
            notify_url: notifyUrl,
            first_name: firstName,
            last_name: lastName,
            address: address,
            city: city,
            state: state,
            zip: zip,
            country: country,
            phone: phone,
            description: description || `Payment for order ${merchantRef || 'N/A'}`,
            merchant_ref: merchantRef,
            metadata: metadata
        };

        console.log('Sending request to Payomatix API:', PAYOMATIX_API_URL, payomatixRequestBody);

        const payomatixResponse = await fetch(PAYOMATIX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': PAYOMATIX_SECRET_KEY
            },
            body: JSON.stringify(payomatixRequestBody)
        });

        const payomatixData = await payomatixResponse.json();

        if (payomatixResponse.ok) {
            console.log('Payomatix API successful response:', payomatixData);

            if (payomatixData.redirect_url) { // Sample uses 'redirect_url', not 'redirection_url'
                res.json({
                    success: true,
                    message: 'Payment intent created successfully. Redirect URL received.',
                    redirectUrl: payomatixData.redirect_url, // Sample uses 'redirect_url'
                    transactionId: payomatixData.merchant_ref || payomatixData.transaction_id // Use merchant_ref if available, fallback to transaction_id
                });
            } else {
                console.warn('Payomatix successful response did not contain "redirect_url":', payomatixData);
                res.status(500).json({
                    success: false,
                    message: 'Payment intent created, but redirection URL was not provided by Payomatix. Please check Payomatix API response format.',
                    payomatixResponse: payomatixData
                });
            }

        } else {
            console.error('Error response from Payomatix API (status:', payomatixResponse.status, '):', payomatixData);
            res.status(payomatixResponse.status || 500).json({
                success: false,
                message: 'Failed to create payment intent with Payomatix.',
                error: payomatixData.response || payomatixData.message || payomatixData.error || 'Unknown error from Payomatix API.',
                payomatixErrors: payomatixData.errors // Pass specific errors object if available
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

// Webhook endpoint remains the same (implementation details depend on Payomatix webhook docs)
app.post('/payomatix-webhook', (req, res) => {
    console.log('Received Payomatix webhook:', req.body);
    // ... (webhook verification and processing logic remains the same)
    res.status(200).json({ received: true, message: 'Webhook received and processed.' });
});

app.listen(port, () => {
    console.log(`Payomatix production backend server listening at http://localhost:${port}`);
    console.log('----------------------------------------------------');
    console.log('IMPORTANT PRODUCTION NOTES:');
    console.log(`1. Your Public Key: ${PAYOMATIX_PUBLIC_KEY}`);
    console.log(`2. Your Secret Key: ${PAYOMATIX_SECRET_KEY ? '****** (loaded from .env)' : 'NOT LOADED! Check .env'}`);
    console.log(`3. Payomatix API URL (User-provided, verify for PRODUCTION): ${PAYOMATIX_API_URL}`);
    console.log(`4. CORS Origin: ${process.env.FRONTEND_URL || '*'}`);
    console.log('5. Ensure your server IPs are whitelisted in Payomatix portal (https://portal.payomatix.com/ip-whitelist)!');
    console.log('6. Implement webhook signature verification in /payomatix-webhook for security (CRITICAL).');
    console.log('7. Use HTTPS for all production traffic (frontend and backend).');
    console.log('----------------------------------------------------');

    if (!PAYOMATIX_PUBLIC_KEY || !PAYOMATIX_SECRET_KEY) {
        console.error('ERROR: Payomatix keys are not loaded from .env! Ensure your .env file is correctly configured.');
    }
});
