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

// Subscribe to list
async function handleSubscribe(email) {
  if (!isValidEmail(email)) {
    throw new Error('Email invalide');
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  
  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email,
      listIds: [2],
      updateEnabled: true
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erreur lors de la souscription');
  }

  return {
    success: true,
    message: 'Inscription réussie'
  };
}

// Send contact email
async function handleContact(name, email, organization, message) {
  if (!isValidEmail(email)) {
    throw new Error('Email invalide');
  }

  if (!name || !message) {
    throw new Error('Nom et message requis');
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  
  // Escape inputs
  const safeName = escapeHtml(name);
  const safeOrg = escapeHtml(organization || 'Non spécifié');
  const safeMessage = escapeHtml(message);

  // Send email
  const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: [{ email: 'contact@ecovoltt.fr', name: 'EcoVolt Team' }],
      sender: { email: 'noreply@ecovoltt.fr', name: 'EcoVolt' },
      subject: `📩 Nouveau contact: ${safeName}`,
      htmlContent: `
        <h2 style="color: #00A6ED;">Nouveau message de contact</h2>
        <p><strong>Nom:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Organisation:</strong> ${safeOrg}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage.replace(/\n/g, '<br>')}</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #a8b5b0;">Message envoyé depuis EcoVolt.fr</p>
      `,
      replyTo: { email: email, name: safeName }
    })
  });

  if (!emailResponse.ok) {
    const error = await emailResponse.json();
    throw new Error(error.message || 'Erreur lors de l\'envoi du email');
  }

  // Add to investors list
  try {
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        attributes: {
          FIRSTNAME: safeName,
          ORGANIZATION: safeOrg
        },
        listIds: [3],
        updateEnabled: true
      })
    });
  } catch (err) {
    // Don't fail if adding to list fails
    console.log('Could not add to investors list:', err);
  }

  return {
    success: true,
    message: 'Message envoyé avec succès'
  };
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
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) {
      console.error('BREVO_API_KEY not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Erreur de configuration serveur: API key manquante' })
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
    console.error('Function error:', error.message);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: error.message || 'Erreur serveur'
      })
    };
  }
};
