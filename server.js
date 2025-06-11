require('dotenv').config(); 
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet'); 
const Joi = require('joi'); 

const app = express();
const port = 3000;

const PAYOMATIX_PUBLIC_KEY = process.env.PAYOMATIX_SECRET_KEY;
const PAYOMATIX_SECRET_KEY = process.env.PAYOMATIX_SECRET_KEY;

const PAYOMATIX_API_URL = 'https://admin.payomatix.com/payment/merchant/transaction';
// const GetTransactionStatusUrl = 'https://admin.payomatix.com/payment/get/transaction';

app.use(helmet());

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
    merchantRef: Joi.string().max(50).required().messages({
    'string.base': 'Merchant reference must be a string.',
    'any.required': 'Merchant reference is required.',
    'string.max': 'Merchant reference must not exceed 50 characters.'
})
});

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
        customerEmail,
        merchantRef,
        returnUrl,
        notifyUrl,
    } = value;


    try {
const payomatixRequestBody = JSON.stringify({
    email: customerEmail.trim(),  
    amount: amount.toFixed(2).trim(),  
    currency: currency.trim(),
    return_url: returnUrl.trim(),  
    notify_url: notifyUrl.trim(),  
    merchant_ref: merchantRef.trim()
});



console.log('Sending request to Payomatix API:', PAYOMATIX_API_URL, payomatixRequestBody);

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
            console.log('Payomatix API successful response (redirect):', payomatixData);

            if (payomatixData.redirect_url) {
                res.json({
                    success: true,
                    message: 'Payment intent created successfully. Redirect URL received.',
                    redirectUrl: payomatixData.redirect_url,
                    transactionId: payomatixData.merchant_ref || payomatixData.transaction_id // Assuming merchant_ref or transaction_id might be present in a successful redirect response
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
            res.status(payomatixResponse.status || 500).json({ // Still use HTTP status if available, fallback to 500
                success: false,
                message: 'Failed to create payment intent with Payomatix.',
                error: payomatixData.response || payomatixData.message || 'Unknown error from Payomatix API.',
                payomatixErrors: payomatixData.errors // Pass specific errors object if available
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

app.post('/payomatix-webhook', (req, res) => {
    console.log('Received Payomatix webhook:', req.body);
    res.status(200).json({ received: true, message: 'Webhook received and processed.' });
});

// app.post('/get-transaction-status', async (req, res) => {
//     console.log('Received request to get transaction status:', req.body);   

//     const { transactionId } = req.body;

//     if (!transactionId) {
//         return res.status(400).json({
//             success: false,
//             message: 'Transaction ID is required.'
//         });
//     }

//     try {
//         const payomatixResponse = await fetch(`${GetTransactionStatusUrl}/${transactionId}`, {
//             method: 'GET',
//             headers: {
//                 'Accept': 'application/json',
//                 'Authorization': PAYOMATIX_SECRET_KEY
//             }
//         });

//         const payomatixData = await payomatixResponse.json();

//         console.log('Raw Payomatix API response data:', payomatixData);

//         if (payomatixData.responseCode === 200) {
//             console.log('Payomatix API successful response (transaction status):', payomatixData);
//             res.json({
//                 success: true,
//                 message: 'Transaction status retrieved successfully.',
//                 status: payomatixData.status,
//                 transactionId: payomatixData.transaction_id
//             });
//         } else {
//             console.error('Error response from Payomatix API:', payomatixData);
//             res.status(payomatixResponse.status || 500).json({
//                 success: false,
//                 message: 'Failed to retrieve transaction status from Payomatix.',
//                 error: payomatixData.response || payomatixData.message || 'Unknown error from Payomatix API.'
//             });
//         }

//     } catch (error) {
//         console.error('Server error during transaction status retrieval:', error);
//         res.status(500).json({
//             success: false,
//             message: 'An internal server error occurred while processing your request.',
//             error: error.message
//         });
//     }
// });

app.listen(3000, () => {
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

