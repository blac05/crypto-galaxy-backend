const express = require(‘express’);
const router = express.Router();
const User = require(’../models/User’);
const auth = require(’../middleware/auth’); // your existing auth middleware

// ── GET current user profile ──────────────────────────────────────────────────
router.get(’/profile’, auth, async (req, res) => {
try {
const user = await User.findById(req.user.id);
if (!user) return res.status(404).json({ message: ‘User not found’ });
res.json({ success: true, user: user.toSafeObject() });
} catch (err) {
res.status(500).json({ message: ‘Server error’ });
}
});

// ── UPDATE profile picture ────────────────────────────────────────────────────
// Accepts base64 image string in body
router.put(’/profile/picture’, auth, async (req, res) => {
try {
const { profilePicture } = req.body;
if (!profilePicture) return res.status(400).json({ message: ‘No image provided’ });

```
// Basic size check — base64 of 5MB ~ 6.8M chars
if (profilePicture.length > 7000000) {
  return res.status(400).json({ message: 'Image too large. Max 5MB.' });
}

const user = await User.findByIdAndUpdate(
  req.user.id,
  { profilePicture },
  { new: true }
);
res.json({ success: true, user: user.toSafeObject() });
```

} catch (err) {
res.status(500).json({ message: ‘Server error’ });
}
});

// ── UPDATE profile info (bio, name) ──────────────────────────────────────────
router.put(’/profile’, auth, async (req, res) => {
try {
const { firstName, lastName, bio } = req.body;
const updates = {};
if (firstName) updates.firstName = firstName.trim();
if (lastName)  updates.lastName  = lastName.trim();
if (bio !== undefined) updates.bio = bio.trim();

```
const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
res.json({ success: true, user: user.toSafeObject() });
```

} catch (err) {
res.status(500).json({ message: ‘Server error’ });
}
});

// ── SUBMIT ID verification ────────────────────────────────────────────────────
// Accepts base64 images: idDocument + selfieWithId
router.post(’/profile/verify-id’, auth, async (req, res) => {
try {
const { idDocument, selfieWithId } = req.body;

```
if (!idDocument || !selfieWithId) {
  return res.status(400).json({ message: 'Both ID document and selfie are required' });
}

// Check if already verified
const user = await User.findById(req.user.id);
if (user.isIdVerified) {
  return res.status(400).json({ message: 'ID already verified' });
}
if (user.idVerificationStatus === 'pending') {
  return res.status(400).json({ message: 'Verification already submitted and under review' });
}

const updated = await User.findByIdAndUpdate(
  req.user.id,
  {
    idDocument,
    selfieWithId,
    idVerificationStatus: 'pending',
    idVerificationSubmittedAt: new Date(),
  },
  { new: true }
);

// In production you would trigger a real KYC review here.
// For demo: auto-approve after 5 seconds
setTimeout(async () => {
  await User.findByIdAndUpdate(req.user.id, {
    isIdVerified: true,
    idVerificationStatus: 'approved',
  });
}, 5000);

res.json({
  success: true,
  message: 'Verification submitted! Your ID is under review.',
  user: updated.toSafeObject(),
});
```

} catch (err) {
res.status(500).json({ message: ‘Server error’ });
}
});

module.exports = router;