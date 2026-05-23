const https = require('https');

// Initialize Brevo API
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3';

// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// HTML escape for safety
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Make HTTPS request
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.brevo.com',
      path: `/v3${path}`,
      method: method,
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          // Only try to parse JSON if content-type is application/json
          const contentType = res.headers['content-type'] || '';
          let parsed = {};
          
          if (contentType.includes('application/json') && body) {
            parsed = JSON.parse(body);
          } else if (body && !contentType.includes('text/html')) {
            // Try to parse anyway if not HTML
            try {
              parsed = JSON.parse(body);
            } catch (e) {
              parsed = { error: body.substring(0, 200) };
            }
          } else if (contentType.includes('text/html')) {
            // HTML error response
            parsed = { error: 'Server returned HTML error' };
          }
          
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          console.error('Parse error:', e, 'Body:', body.substring(0, 200));
          resolve({ status: res.statusCode, body: { error: 'Invalid response format: ' + body.substring(0, 100) } });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Subscribe to list
async function handleSubscribe(email) {
  if (!isValidEmail(email)) {
    throw new Error('Email invalide');
  }

  try {
    const response = await makeRequest('POST', '/contacts', {
      email: email,
      listIds: [2], // Replace with your Brevo list ID
      updateEnabled: true
    });

    if (response.status >= 400) {
      throw new Error(response.body.message || response.body.error || `Erreur API (${response.status})`);
    }

    return {
      success: true,
      message: 'Inscription réussie'
    };
  } catch (error) {
    throw new Error('Erreur Brevo: ' + error.message);
  }
}

// Send contact email
async function handleContact(name, email, organization, message) {
  if (!isValidEmail(email)) {
    throw new Error('Email invalide');
  }

  if (!name || !message) {
    throw new Error('Nom et message requis');
  }

  // Escape inputs
  const safeName = escapeHtml(name);
  const safeOrg = escapeHtml(organization || 'Non spécifié');
  const safeMessage = escapeHtml(message);

  try {
    // Send to contact email
    const emailContent = `
      <h2>Nouveau message de contact</h2>
      <p><strong>Nom:</strong> ${safeName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Organisation:</strong> ${safeOrg}</p>
      <p><strong>Message:</strong></p>
      <p>${safeMessage.replace(/\n/g, '<br>')}</p>
    `;

    const response = await makeRequest('POST', '/smtp/email', {
      to: [{ email: 'invest@ecovoltt.fr' }],
      sender: { email: 'contact@ecovoltt.fr', name: 'EcoVolt' },
      subject: `Nouveau contact: ${safeName}`,
      htmlContent: emailContent,
      replyTo: { email: email }
    });

    if (response.status >= 400) {
      throw new Error(response.body.message || response.body.error || `Erreur API (${response.status})`);
    }

    // Subscribe sender to list
    await makeRequest('POST', '/contacts', {
      email: email,
      attributes: {
        INVESTOR_NAME: safeName,
        INVESTOR_ORG: safeOrg
      },
      listIds: [3], // Investors list
      updateEnabled: true
    }).catch(() => {}); // Don't fail if subscription fails

    return {
      success: true,
      message: 'Message envoyé avec succès'
    };
  } catch (error) {
    throw new Error('Erreur: ' + error.message);
  }
}

// Main handler
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Méthode non autorisée' })
    };
  }

  try {
    // Check API key
    if (!BREVO_API_KEY) {
      console.error('BREVO_API_KEY not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Erreur de configuration serveur' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { action, email, name, organization, message } = body;

    let result;

    if (action === 'subscribe') {
      result = await handleSubscribe(email);
    } else if (action === 'contact') {
      result = await handleContact(name, email, organization, message);
    } else {
      throw new Error('Action non reconnu');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: error.message || 'Erreur serveur'
      })
    };
  }
};
