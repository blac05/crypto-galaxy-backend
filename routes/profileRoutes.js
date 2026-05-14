const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' }); // Fixed: was missing closing quote
  }
});

// PUT /api/profile/picture
router.put('/profile/picture', auth, async (req, res) => {
  try {
    const { profilePicture } = req.body;
    if (!profilePicture) return res.status(400).json({ message: 'No image provided' });

    if (profilePicture.length > 7000000) {
      return res.status(400).json({ message: 'Image too large. Max 5MB.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture },
      { new: true }
    );
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, bio } = req.body;
    const updates = {};
    if (firstName) updates.firstName = firstName.trim();
    if (lastName)  updates.lastName  = lastName.trim();
    if (bio !== undefined) updates.bio = bio.trim();

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/profile/verify-id
router.post('/profile/verify-id', auth, async (req, res) => {
  try {
    const { idDocument, selfieWithId } = req.body;

    if (!idDocument || !selfieWithId) {
      return res.status(400).json({ message: 'Both ID document and selfie are required' });
    }

    const user = await User.findById(req.user._id);
    if (user.isIdVerified) {
      return res.status(400).json({ message: 'ID already verified' });
    }
    if (user.idVerificationStatus === 'pending') {
      return res.status(400).json({ message: 'Verification already submitted and under review' });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        idDocument,
        selfieWithId,
        idVerificationStatus: 'pending',
        idVerificationSubmittedAt: new Date(),
      },
      { new: true }
    );

    // Auto-approve after 5s for demo
    setTimeout(async () => {
      await User.findByIdAndUpdate(req.user._id, {
        isIdVerified: true,
        idVerificationStatus: 'approved',
      });
    }, 5000);

    res.json({
      success: true,
      message: 'Verification submitted! Your ID is under review.',
      user: updated.toSafeObject(),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
