const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User').default;
const auth = require('../middleware/auth');
const { sendEmail, sendSms, templates } = require('../services/notificationService');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const OTP_MINS = parseInt(process.env.OTP_EXPIRES_MINUTES || '10');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email already registered' });

    const user = new User({ firstName, lastName, email, phone, password });

    // Generate OTPs
    const emailOtp = user.generateOtp();
    const phoneOtp = user.generateOtp();
    const expiry = new Date(Date.now() + OTP_MINS * 60 * 1000);

    user.emailOtp = emailOtp;
    user.emailOtpExpires = expiry;
    user.phoneOtp = phoneOtp;
    user.phoneOtpExpires = expiry;

    await user.save();

    // Send notifications
    await sendEmail(email, templates.otp(firstName, emailOtp, 'email'));
    await sendSms(phone, `🚀 Crypto Galaxy: Your verification code is ${phoneOtp}. Expires in ${OTP_MINS} minutes.`);

    console.log(`[DEV] Email OTP for ${email}: ${emailOtp}`);
    console.log(`[DEV] Phone OTP for ${phone}: ${phoneOtp}`);

    res.status(201).json({ message: 'Account created. Check your email and phone for verification codes.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isEmailVerified) return res.status(400).json({ message: 'Email already verified' });
    if (!user.emailOtp || user.emailOtp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (user.emailOtpExpires < new Date()) return res.status(400).json({ message: 'OTP has expired' });

    user.isEmailVerified = true;
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed' });
  }
});

// POST /api/auth/verify-phone
router.post('/verify-phone', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isPhoneVerified) return res.status(400).json({ message: 'Phone already verified' });
    if (!user.phoneOtp || user.phoneOtp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (user.phoneOtpExpires < new Date()) return res.status(400).json({ message: 'OTP has expired' });

    user.isPhoneVerified = true;
    user.phoneOtp = undefined;
    user.phoneOtpExpires = undefined;
    await user.save();

    res.json({ message: 'Phone verified successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

    if (!user.isEmailVerified) return res.status(403).json({ message: 'Please verify your email first' });
    if (!user.isActive) return res.status(403).json({ message: 'Account suspended. Contact support.' });

    // Log login
    user.lastLogin = new Date();
    user.loginHistory.push({ ip: req.ip, userAgent: req.get('User-Agent'), timestamp: new Date() });
    await user.save();

    const token = signToken(user._id);

    // Send login alert
    const ip = req.ip || req.connection.remoteAddress;
    if (user.notifications?.login) {
      await sendEmail(user.email, templates.loginAlert(user.firstName, ip, new Date().toLocaleString()));
      await sendSms(user.phone, `🔐 Crypto Galaxy: New login detected at ${new Date().toLocaleTimeString()}. IP: ${ip}. If not you, change your password immediately.`);
    }

    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user.toSafeObject ? req.user.toSafeObject() : req.user });
});

module.exports = router;
