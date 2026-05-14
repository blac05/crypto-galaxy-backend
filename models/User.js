const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const schema = mongoose.Schema;

const userSchema = new mongoose.Schema({
firstName: { type: String, required: true, trim: true },
lastName: { type: String, required: true, trim: true },
email: { type: String, required: true, unique: true, lowercase: true, trim: true },
phone: { type: String, required: true, trim: true },
password: { type: String, required: true, minlength: 8 },

// Profile
profilePicture: { type: String, default: null }, // base64 or URL
bio: { type: String, default: '' },

// Verification
isEmailVerified: { type: Boolean, default: false },
isPhoneVerified: { type: Boolean, default: false },
isIdVerified: { type: Boolean, default: false },
idVerificationStatus: {
type: String,
enum: ['none', 'pending', 'approved', 'rejected'],
default: 'none',
},
idVerificationSubmittedAt: { type: Date, default: null },
idDocument: { type: String, default: null },   // base64 of ID/passport image
selfieWithId: { type: String, default: null },  // base64 of selfie with ID

emailOtp: { type: String },
emailOtpExpires: { type: Date },
phoneOtp: { type: String },
phoneOtpExpires: { type: Date },

// Account status
isActive: { type: Boolean, default: true },

// Wallet balances
wallet: {
BTC:  { type: Number, default: 0 },
ETH:  { type: Number, default: 0 },
SOL:  { type: Number, default: 0 },
USDT: { type: Number, default: 0 },
BNB:  { type: Number, default: 0 },
XRP:  { type: Number, default: 0 },
ADA:  { type: Number, default: 0 },
DOGE: { type: Number, default: 0 },
},

// Pending transaction lock
pendingTransaction: { type: Boolean, default: false },
pendingTransactionId: { type: String, default: null },

// Settings
notifications: {
email:       { type: Boolean, default: true },
sms:         { type: Boolean, default: true },
login:       { type: Boolean, default: true },
transaction: { type: Boolean, default: true },
},

lastLogin: { type: Date },
loginHistory: [{
ip:        String,
userAgent: String,
timestamp: { type: Date, default: Date.now },
}],
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
if (!this.isModified('password')) return next();
this.password = await bcrypt.hash(this.password, 12);
next();
});

userSchema.methods.comparePassword = async function (candidate) {
return bcrypt.compare(candidate, this.password);
};

userSchema.methods.generateOtp = function () {
return Math.floor(100000 + Math.random() * 900000).toString();
};

userSchema.methods.toSafeObject = function () {
const obj = this.toObject();
delete obj.password;
delete obj.emailOtp;
delete obj.emailOtpExpires;
delete obj.phoneOtp;
delete obj.phoneOtpExpires;
return obj;
};

module.exports = mongoose.model('User', userSchema);