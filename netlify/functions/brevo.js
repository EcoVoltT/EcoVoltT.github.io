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
          const parsed = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: { error: body } });
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
      throw new Error(response.body.message || 'Erreur lors de la souscription');
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
      <h2 style="color: #00A6ED;">Nouveau message de contact</h2>
      <p><strong>Nom:</strong> ${safeName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Organisation:</strong> ${safeOrg}</p>
      <p><strong>Message:</strong></p>
      <p>${safeMessage.replace(/\n/g, '<br>')}</p>
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
      <p style="font-size: 12px; color: #a8b5b0;">Message envoyé depuis EcoVolt.fr</p>
    `;

    const response = await makeRequest('POST', '/smtp/email', {
      to: [{ email: 'contact@ecovoltt.fr', name: 'EcoVolt Team' }],
      sender: { email: 'noreply@ecovoltt.fr', name: 'EcoVolt' },
      subject: `📩 Nouveau contact: ${safeName}`,
      htmlContent: emailContent,
      replyTo: { email: email, name: safeName }
    });

    if (response.status >= 400) {
      throw new Error(response.body.message || 'Erreur lors de l\'envoi');
    }

    // Subscribe sender to investors list
    await makeRequest('POST', '/contacts', {
      email: email,
      attributes: {
        FIRSTNAME: safeName,
        ORGANIZATION: safeOrg
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

    console.log('Received action:', action);
    console.log('Email:', email);

    let result;

    if (action === 'subscribe') {
      result = await handleSubscribe(email);
    } else if (action === 'contact') {
      result = await handleContact(name, email, organization, message);
    } else {
      throw new Error('Action non reconnu: ' + action);
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
