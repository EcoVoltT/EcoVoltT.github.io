const BREVO_API_KEY = process.env.BREVO_API_KEY;

exports.handler = async (event) => {
  // Проверка метода
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { email, type, name, org, message } = JSON.parse(event.body);

    // Валидация email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email address' })
      };
    }

    if (!BREVO_API_KEY) {
      console.error('BREVO_API_KEY not configured');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Тип 1: Подписка на рассылку
    if (type === 'subscribe') {
      const contactResponse = await fetch('https://api.brevo.com/v3/contacts', {
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

      if (!contactResponse.ok) {
        const error = await contactResponse.json();
        console.error('Brevo API error:', error);
        return {
          statusCode: contactResponse.status,
          body: JSON.stringify(error)
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Email added to list' })
      };
    }

    // Тип 2: Контактная форма инвестора
    if (type === 'investor') {
      // Шаг 1: Добавить контакт в Brevo
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          attributes: {
            FIRSTNAME: name,
            ORGANIZATION: org || 'N/A'
          },
          updateEnabled: true
        })
      });

      // Шаг 2: Отправить email в контактный ящик
      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            name: 'EcoVolt Site',
            email: 'noreply@ecovoltt.fr'
          },
          to: [
            {
              email: 'contact@ecovoltt.fr',
              name: 'EcoVolt Team'
            }
          ],
          replyTo: {
            email: email,
            name: name
          },
          subject: `📩 Nouveau message d'investisseur: ${name}`,
          htmlContent: `
            <h2 style="color: #00A6ED;">Nouveau message d'investisseur</h2>
            <p><strong>Nom:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Organisation:</strong> ${escapeHtml(org || 'N/A')}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
            <hr>
            <p style="font-size: 12px; color: #a8b5b0;">Message envoyé depuis EcoVolt.fr</p>
          `
        })
      });

      if (!emailResponse.ok) {
        const error = await emailResponse.json();
        console.error('Email send error:', error);
        return {
          statusCode: emailResponse.status,
          body: JSON.stringify(error)
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Message sent successfully' })
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request type' })
    };
  } catch (err) {
    console.error('Server error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

// Функция для экранирования HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
