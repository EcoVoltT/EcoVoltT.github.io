const axios = require('axios');

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, email, name, organization, message } = body;

    // Validate Brevo API key
    if (!process.env.BREVO_API_KEY) {
      console.error('Missing BREVO_API_KEY environment variable');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    // Email subscription action
    if (action === 'subscribe') {
      if (!email) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Email is required' }),
        };
      }

      try {
        // Add contact to Brevo list
        const response = await axios.post(
          'https://api.brevo.com/v3/contacts',
          {
            email: email,
            listIds: [2], // Replace with your actual Brevo list ID
            updateEnabled: true, // Update if already exists
          },
          {
            headers: {
              'api-key': process.env.BREVO_API_KEY,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log('Brevo subscription response:', response.status);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: 'Successfully subscribed to mailing list',
            contactId: response.data.id,
          }),
        };
      } catch (error) {
        console.error('Brevo subscription error:', error.response?.data || error.message);
        
        // Handle duplicate contact (already subscribed)
        if (error.response?.status === 400 && error.response?.data?.code === 'duplicate_parameter') {
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              success: true,
              message: 'Email already subscribed',
            }),
          };
        }

        throw error;
      }
    }

    // Contact form submission action
    if (action === 'contact') {
      if (!email || !name || !message) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Email, name, and message are required' }),
        };
      }

      try {
        // Send email via Brevo SMTP
        const response = await axios.post(
          'https://api.brevo.com/v3/smtp/email',
          {
            to: [{ email: 'contact@ecovoltt.fr', name: 'EcoVolt Contact' }],
            from: { email: 'noreply@ecovoltt.fr', name: 'EcoVolt Form' },
            replyTo: { email: email, name: name },
            subject: `New Contact Form Submission from ${name}`,
            htmlContent: `
              <h2>New Contact Form Submission</h2>
              <p><strong>Name:</strong> ${escapeHtml(name)}</p>
              <p><strong>Email:</strong> ${escapeHtml(email)}</p>
              ${organization ? `<p><strong>Organization:</strong> ${escapeHtml(organization)}</p>` : ''}
              <p><strong>Message:</strong></p>
              <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
            `,
            textContent: `
Name: ${name}
Email: ${email}
${organization ? `Organization: ${organization}\n` : ''}
Message:
${message}
            `,
          },
          {
            headers: {
              'api-key': process.env.BREVO_API_KEY,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log('Brevo email response:', response.status);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: 'Message sent successfully',
            messageId: response.data.messageId,
          }),
        };
      } catch (error) {
        console.error('Brevo email error:', error.response?.data || error.message);
        throw error;
      }
    }

    // Invalid action
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid action. Use "subscribe" or "contact"' }),
    };
  } catch (error) {
    console.error('Function error:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};

// Helper function to escape HTML special characters
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
