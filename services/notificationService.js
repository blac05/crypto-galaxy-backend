const nodemailer = require('nodemailer');

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email templates
const templates = {
  otp: (name, otp, type) => ({
    subject: `🔐 Crypto Galaxy - ${type === 'email' ? 'Email' : 'Phone'} Verification Code`,
    html: `
      <div style="background:#000008;padding:40px;font-family:'Segoe UI',sans-serif;color:#E8E8FF;max-width:600px;margin:0 auto;border-radius:16px;border:1px solid rgba(0,245,255,0.2)">
        <div style="text-align:center;margin-bottom:32px">
          <h1 style="font-size:28px;font-weight:900;background:linear-gradient(135deg,#00F5FF,#7B2FBE);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:3px">CRYPTO GALAXY</h1>
          <p style="color:#8888AA;font-size:13px;letter-spacing:2px">THE UNIVERSE OF FINANCE</p>
        </div>
        <h2 style="color:#00F5FF;font-size:20px;margin-bottom:12px">Hello, ${name} 👋</h2>
        <p style="color:#8888AA;margin-bottom:28px">Your ${type === 'email' ? 'email' : 'phone'} verification code is:</p>
        <div style="background:rgba(0,245,255,0.05);border:2px solid rgba(0,245,255,0.3);border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
          <span style="font-size:42px;font-weight:900;color:#00F5FF;letter-spacing:12px">${otp}</span>
        </div>
        <p style="color:#8888AA;font-size:13px">This code expires in <strong style="color:#FFD700">${process.env.OTP_EXPIRES_MINUTES || 10} minutes</strong>. Never share this code with anyone.</p>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;color:#8888AA;font-size:12px">
          🔐 256-bit encrypted · Crypto Galaxy Security Team
        </div>
      </div>
    `,
  }),

  loginAlert: (name, ip, timestamp) => ({
    subject: `🔐 Crypto Galaxy - New Login Detected`,
    html: `
      <div style="background:#000008;padding:40px;font-family:'Segoe UI',sans-serif;color:#E8E8FF;max-width:600px;margin:0 auto;border-radius:16px;border:1px solid rgba(255,159,0,0.3)">
        <h1 style="color:#FFD700;font-size:22px;margin-bottom:20px">🔐 New Login Alert</h1>
        <p>Hello <strong>${name}</strong>,</p>
        <p style="color:#8888AA;margin:16px 0">A new login was detected on your Crypto Galaxy account:</p>
        <div style="background:rgba(255,159,0,0.08);border:1px solid rgba(255,159,0,0.3);border-radius:10px;padding:20px;margin-bottom:20px">
          <div style="margin-bottom:8px"><span style="color:#8888AA">IP Address:</span> <span style="color:white;font-family:monospace">${ip}</span></div>
          <div><span style="color:#8888AA">Time:</span> <span style="color:white;font-family:monospace">${timestamp}</span></div>
        </div>
        <p style="color:#FF3131;font-size:13px">⚠️ If this wasn't you, secure your account immediately by changing your password.</p>
      </div>
    `,
  }),

  transactionAlert: (name, type, amount, coin, status, reference) => ({
    subject: `💸 Crypto Galaxy - Transaction ${status === 'completed' ? 'Completed' : 'Initiated'}`,
    html: `
      <div style="background:#000008;padding:40px;font-family:'Segoe UI',sans-serif;color:#E8E8FF;max-width:600px;margin:0 auto;border-radius:16px;border:1px solid rgba(0,255,135,0.2)">
        <h1 style="color:#00FF87;font-size:22px;margin-bottom:20px">💸 Transaction ${status === 'completed' ? '✅ Completed' : '⏳ Initiated'}</h1>
        <p>Hello <strong>${name}</strong>,</p>
        <div style="background:rgba(0,255,135,0.05);border:1px solid rgba(0,255,135,0.2);border-radius:10px;padding:20px;margin:20px 0">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px"><span style="color:#8888AA">Type:</span><span style="color:white;text-transform:capitalize">${type}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px"><span style="color:#8888AA">Amount:</span><span style="color:#00FF87;font-weight:bold">${amount} ${coin}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px"><span style="color:#8888AA">Status:</span><span style="color:${status === 'completed' ? '#00FF87' : '#FF9F00'}">${status}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#8888AA">Reference:</span><span style="font-family:monospace;color:white;font-size:12px">${reference}</span></div>
        </div>
        <p style="color:#8888AA;font-size:13px">Keep this reference number for your records.</p>
      </div>
    `,
  }),
};

// Send email
async function sendEmail(to, template) {
  try {
    await transporter.sendMail({
      from: `"Crypto Galaxy" <${process.env.EMAIL_FROM}>`,
      to,
      subject: template.subject,
      html: template.html,
    });
    return true;
  } catch (err) {
    console.error('Email error:', err.message);
    return false;
  }
}

// Send SMS via Twilio
async function sendSms(to, message) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID === 'your_twilio_account_sid') {
      console.log(`[SMS MOCK] To: ${to} | Message: ${message}`);
      return true;
    }
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilio.messages.create({ body: message, from: process.env.TWILIO_PHONE_NUMBER, to });
    return true;
  } catch (err) {
    console.error('SMS error:', err.message);
    return false;
  }
}

module.exports = { sendEmail, sendSms, templates };
