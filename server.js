// require('dotenv').config(); 
// const express = require('express');
// const bodyParser = require('body-parser');
// const cors = require('cors');
// const helmet = require('helmet'); 
// const Joi = require('joi'); 
// const morgan = require('morgan'); // <--- Add this line to require morgan

// const app = express();
// const port = 3000;

// const PAYOMATIX_PUBLIC_KEY = process.env.PAYOMATIX_PUBLIC_KEY;
// const PAYOMATIX_SECRET_KEY = process.env.PAYOMATIX_SECRET_KEY;
// const MEDICARE_INTERNAL_SECRET = process.env.MEDICARE_INTERNAL_SECRET; // Ensure this is set in your .env
// const MEDICARE_BACKEND_URL = process.env.MEDICARE_BACKEND_URL; // e.g., 'http://your-medicare-backend.com'

// const PAYOMATIX_API_URL = 'https://admin.payomatix.com/payment/merchant/transaction';

// app.use(helmet());

// // Add Morgan middleware here, before your routes and body-parser (for request details)
// // You can choose different formats: 'dev', 'tiny', 'short', 'common', 'combined'
// // 'dev' is good for development (color-coded, concise)
// // 'combined' is good for production (standard Apache combined log format)
// // Let's use 'dev' for now, but you might switch to 'combined' or a custom format for production.
// app.use(morgan('dev')); // <--- Add this line

// app.use(bodyParser.json());

// app.use(cors({
//     origin:'*', // For production, replace '*' with your actual frontend URLs
//     methods: ['GET', 'POST'],
//     allowedHeaders: ['Content-Type', 'Authorization']
// }));

// const paymentSchema = Joi.object({
//     amount: Joi.number().positive().precision(2).required().messages({
//         'number.base': 'Amount must be a number.',
//         'number.positive': 'Amount must be positive.',
//         'number.precision': 'Amount must have at most 2 decimal places.',
//         'any.required': 'Amount is required.'
//     }),
//     currency: Joi.string().length(3).uppercase().required().messages({
//         'string.base': 'Currency must be a string.',
//         'string.length': 'Currency must be 3 characters long (e.g., INR, USD).',
//         'string.uppercase': 'Currency must be uppercase.',
//         'any.required': 'Currency is required.'
//     }),
//     customerEmail: Joi.string().email().required().messages({
//         'string.base': 'Customer email must be a string.',
//         'string.email': 'Customer email must be a valid email address.',
//         'any.required': 'Customer email is required.'
//     })
// });

// app.post('/create-payment-intent', async (req, res) => {
//     // Morgan will already log the method and URL, so you might not need this specific console.log here.
//     // console.log('Received request to create payment intent:', req.body); 

//     const { error, value } = paymentSchema.validate(req.body, { abortEarly: false });
//     if (error) {
//         console.error('Validation error for /create-payment-intent:', error.details);
//         return res.status(400).json({
//             success: false,
//             message: 'Invalid request data provided.',
//             errors: error.details.map(d => d.message)
//         });
//     }
    
//     const {
//         amount,
//         currency,
//         customerEmail
//     } = value;

//     let merchantRef = req.body.merchantRef || `payomatix-merchant-ref-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
//     let returnUrl = 'https://payomatixpaymentgatewayfrontend.onrender.com/payment-status';
//     let notifyUrl = 'https://payomatixpaymentgateway.onrender.com/payomatix-webhook';

//     try {
//         const payomatixRequestBody = JSON.stringify({
//             email: customerEmail.trim(),  
//             amount: amount.toFixed(2),  
//             currency: currency.trim(),
//             return_url: returnUrl.trim(),  
//             notify_url: notifyUrl.trim(),  
//             merchant_ref: merchantRef.trim()
//         });

//         console.log('Sending request to Payomatix API:', PAYOMATIX_API_URL, payomatixRequestBody);

//         const payomatixResponse = await fetch(PAYOMATIX_API_URL, {
//             method: 'POST',
//             headers: {
//                 'Accept': 'application/json',
//                 'Authorization': PAYOMATIX_SECRET_KEY,
//                 'Content-Type': 'application/json'
//             },
//             body: payomatixRequestBody
//         });

//         const payomatixData = await payomatixResponse.json();

//         console.log('Raw Payomatix API response data:', payomatixData);

//         if (payomatixData.responseCode === 300 && payomatixData.status === 'redirect') {
//             console.log('Payomatix API successful response (redirect):', payomatixData);

//             if (payomatixData.redirect_url) {
//                 res.json({
//                     success: true,
//                     message: 'Payment intent created successfully. Redirect URL received.',
//                     redirectUrl: payomatixData.redirect_url,
//                     transactionId: payomatixData.merchant_ref || payomatixData.transaction_id
//                 });
//             } else {
//                 console.warn('Payomatix successful redirect response did not contain "redirect_url":', payomatixData);
//                 res.status(500).json({
//                     success: false,
//                     message: 'Payment intent created, but redirection URL was not provided by Payomatix. Please check Payomatix API response format.',
//                     payomatixResponse: payomatixData
//                 });
//             }
//         } else if (payomatixData.responseCode >= 400 || payomatixData.status === 'validation_error') {
//             console.error('Error response from Payomatix API:', payomatixData);
//             res.status(payomatixResponse.status || 500).json({
//                 success: false,
//                 message: 'Failed to create payment intent with Payomatix.',
//                 error: payomatixData.response || payomatixData.message || 'Unknown error from Payomatix API.',
//                 payomatixErrors: payomatixData.errors
//             });
//         } else {
//             console.warn('Unexpected but not explicitly erroneous response from Payomatix API:', payomatixData);
//             res.status(500).json({
//                 success: false,
//                 message: 'Received an unexpected response from Payomatix API.',
//                 payomatixResponse: payomatixData
//             });
//         }

//     } catch (error) {
//         console.error('Server error during payment intent creation:', error);
//         res.status(500).json({
//             success: false,
//             message: 'An internal server error occurred while processing your payment request.',
//             error: error.message
//         });
//     }
// });

// app.post('/payomatix-webhook', async (req, res) => { // Added async for potential future use (e.g. database updates or notifying Medicare Backend)
//     console.log('Received Payomatix webhook:', req.body);
    
//     // --- IMPORTANT: Webhook Verification ---
//     // You MUST verify that this webhook actually came from Payomatix
//     // and is not a malicious spoof. Consult Payomatix documentation for their signature
//     // verification method (e.g., checking a signature header, IP whitelisting).
//     // If verification fails, return 403 or 401.
//     // Example (pseudo-code, replace with actual Payomatix method):
//     /*
//     const payomatixSignature = req.headers['x-payomatix-signature']; // Check Payomatix docs for the actual header name
//     const rawBody = req.rawBody; // You might need to use a different body parser or a custom middleware to get the raw body before JSON parsing for signature verification.
//     if (!verifyPayomatixSignature(rawBody, payomatixSignature, process.env.PAYOMATIX_WEBHOOK_SECRET)) {
//         console.warn('Webhook signature verification failed!');
//         return res.status(403).json({ message: 'Forbidden: Invalid webhook signature.' });
//     }
//     */
//     // --- END Webhook Verification ---

//     // Extract relevant data from Payomatix webhook payload
//     const payomatixTransactionId = req.body.transaction_id; // Adjust based on actual Payomatix payload
//     const payomatixStatus = req.body.status;             // 'success', 'failed', 'pending', etc.
//     const originalMerchantRef = req.body.merchant_ref; // This should be the correlationId you sent
//     const amount = req.body.amount;
//     const currency = req.body.currency;

//     if (!payomatixTransactionId || !payomatixStatus || !originalMerchantRef) {
//         console.error('Missing critical data in Payomatix webhook payload. Payload:', req.body);
//         return res.status(400).json({ received: false, message: 'Missing transaction data in webhook.' });
//     }

//     try {
//         // --- Now, inform the Medicare Backend ---
//         if (MEDICARE_BACKEND_URL && MEDICARE_INTERNAL_SECRET) {
//             const medicareBackendNotificationUrl = `${MEDICARE_BACKEND_URL}/internal/payment-update`;
//             console.log(`Notifying Medicare Backend at: ${medicareBackendNotificationUrl}`);

//             const responseFromMedicareBackend = await fetch(medicareBackendNotificationUrl, {
//                 method: 'POST',
//                 headers: {
//                     'Content-Type': 'application/json',
//                     'X-Internal-Secret': MEDICARE_INTERNAL_SECRET // Shared secret for internal communication
//                 },
//                 body: JSON.stringify({
//                     correlationId: originalMerchantRef, // Use merchant_ref as correlationId
//                     transactionId: payomatixTransactionId,
//                     status: payomatixStatus,
//                     amount: amount,
//                     currency: currency
//                 })
//             });

//             if (responseFromMedicareBackend.ok) {
//                 console.log('Successfully informed Medicare Backend about transaction:', originalMerchantRef);
//                 res.status(200).json({ received: true, message: 'Webhook received and processed, Medicare Backend informed.' });
//             } else {
//                 const errorData = await responseFromMedicareBackend.json();
//                 console.error('Failed to inform Medicare Backend:', responseFromMedicareBackend.status, errorData);
//                 // Even if notifying Medicare Backend fails, you should still return 200 to Payomatix
//                 // to acknowledge receipt of THEIR webhook and prevent retries from their side.
//                 // Log the failure and consider an internal retry mechanism for Medicare Backend notification.
//                 res.status(200).json({ received: true, message: 'Webhook received, but failed to inform Medicare Backend.' });
//             }
//         } else {
//             console.warn('MEDICARE_BACKEND_URL or MEDICARE_INTERNAL_SECRET not set. Skipping Medicare Backend notification.');
//             res.status(200).json({ received: true, message: 'Webhook received, but Medicare Backend notification skipped.' });
//         }

//     } catch (error) {
//         console.error('Server error during webhook processing or informing Medicare Backend:', error);
//         // Always return 200 to Payomatix if you've processed the webhook on your side
//         // to prevent them from retrying it unnecessarily.
//         res.status(200).json({ received: true, message: 'Webhook received, but internal error occurred.' });
//     }
// });

// // app.post('/get-transaction-status', ... ) // Keep this commented out if not used

// app.listen(3000, () => {
//     console.log(`Payomatix production backend server listening at http://localhost:${port}`);
//     console.log('----------------------------------------------------');
//     console.log('IMPORTANT PRODUCTION NOTES:');
//     console.log(`1. Your Public Key: ${PAYOMATIX_PUBLIC_KEY}`);
//     console.log(`2. Your Secret Key: ${PAYOMATIX_SECRET_KEY ? '****** (loaded from .env)' : 'NOT LOADED! Check .env'}`);
//     console.log(`3. Payomatix API URL (User-provided, verify for PRODUCTION): ${PAYOMATIX_API_URL}`);
//     console.log(`4. CORS Origin: ${process.env.FRONTEND_URL || '*'}`);
//     console.log('5. Ensure your server IPs are whitelisted in Payomatix portal (https://portal.payomatix.com/ip-whitelist)!');
//     console.log('6. Implement webhook signature verification in /payomatix-webhook for security (CRITICAL).');
//     console.log('7. Use HTTPS for all production traffic (frontend and backend).');
//     console.log('----------------------------------------------------');

//     if (!PAYOMATIX_PUBLIC_KEY || !PAYOMATIX_SECRET_KEY) {
//         console.error('ERROR: Payomatix keys are not loaded from .env! Ensure your .env file is correctly configured.');
//     }
//     if (!MEDICARE_BACKEND_URL || !MEDICARE_INTERNAL_SECRET) {
//         console.warn('WARNING: Medicare Backend URL or Internal Secret is not set. Internal notifications will be skipped.');
//     }
// });
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

const PAYOMATIX_API_URL = 'https://admin.payomatix.com/payment/merchant/transaction';

app.use(helmet());

// Add Morgan middleware here, before your routes and body-parser
app.use(morgan('dev')); // Using 'dev' format for concise, color-coded output

// It's good practice to ensure bodyParser can handle raw bodies for webhook signature verification later
// For this example, we keep bodyParser.json() which parses JSON.
// If Payomatix uses a different content type for webhooks, or requires raw body for signature,
// you might need bodyParser.raw() or a custom raw body middleware.
app.use(bodyParser.json());

app.use(cors({
    origin:'*', // For production, replace '*' with your actual frontend URLs
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
app.post('/payomatix-webhook', (req, res) => {
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