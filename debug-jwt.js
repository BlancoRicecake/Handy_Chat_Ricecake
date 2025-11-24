const jwt = require('jsonwebtoken');

// User's NEWLY REISSUED token from handy-platform (after PM2 restart)
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijk3YWRiZDBiLTQ0MWYtNDA3Mi05ODgxLTYxMTQ4YTc1YTk2MCIsImlhdCI6MTc2Mzk2OTYxNSwiZXhwIjoxNzY0NTc0NDE1fQ.1_WR0tGNaTkgHOylVz-FXGkt3iel1AdQGu2tKpiYsaM';

// JWT_SECRET from handy-platform (without backslash)
const HANDY_PLATFORM_SECRET = 'StgHndy2025!Rlwy$Tm#Dev@Env&Jwt*Secret^Key%Auth';
// JWT_SECRET from chat-stack-scaffold (current - incorrect)
const CHAT_STACK_SECRET = 'vhNo84uJ5beayVpsqz4j0/mFtEZghE61+mTUGaCjk9I=';

console.log('=== JWT Token Analysis ===\n');

// 1. Decode without verification to see structure
console.log('1. Token Structure (decoded without verification):');
const decoded = jwt.decode(token, { complete: true });
console.log(JSON.stringify(decoded, null, 2));
console.log();

// 2. Check token expiry
if (decoded && decoded.payload) {
  const now = Math.floor(Date.now() / 1000);
  const exp = decoded.payload.exp;
  const iat = decoded.payload.iat;

  console.log('2. Token Timing:');
  console.log(`   Issued at: ${new Date(iat * 1000).toISOString()}`);
  console.log(`   Expires at: ${new Date(exp * 1000).toISOString()}`);
  console.log(`   Current time: ${new Date(now * 1000).toISOString()}`);
  console.log(`   Token is ${exp > now ? 'VALID' : 'EXPIRED'}`);
  console.log();
}

// 3. Try to verify with handy-platform secret
console.log('3. Verification Test with HANDY-PLATFORM SECRET:');
try {
  const verified = jwt.verify(token, HANDY_PLATFORM_SECRET, {
    algorithms: ['HS256']
  });
  console.log('   ✓ Token verification SUCCESSFUL');
  console.log('   Payload:', JSON.stringify(verified, null, 2));
} catch (error) {
  console.log(`   ✗ Token verification FAILED: ${error.message}`);
  console.log(`   Error type: ${error.name}`);
}
console.log();

// 3b. Try to verify with chat-stack secret (for comparison)
console.log('3b. Verification Test with CHAT-STACK SECRET (old):');
try {
  const verified = jwt.verify(token, CHAT_STACK_SECRET, {
    algorithms: ['HS256']
  });
  console.log('   ✓ Token verification SUCCESSFUL');
  console.log('   Payload:', JSON.stringify(verified, null, 2));
} catch (error) {
  console.log(`   ✗ Token verification FAILED: ${error.message}`);
  console.log(`   Error type: ${error.name}`);
}
console.log();

// 4. Test signing with handy-platform secret
console.log('4. Test Signing with HANDY-PLATFORM SECRET:');
if (decoded && decoded.payload) {
  const { iat, exp, ...payload } = decoded.payload;

  const testToken = jwt.sign(
    payload,
    HANDY_PLATFORM_SECRET,
    { expiresIn: '7d' }
  );

  console.log('   Test token created:', testToken.substring(0, 50) + '...');

  try {
    const verified = jwt.verify(testToken, HANDY_PLATFORM_SECRET);
    console.log('   ✓ Test token verification SUCCESSFUL');
  } catch (error) {
    console.log(`   ✗ Test token verification FAILED: ${error.message}`);
  }
}
console.log();

// 5. Check secret formats
console.log('5. Secret Analysis:');
console.log('\n   HANDY-PLATFORM SECRET:');
console.log(`   Length: ${HANDY_PLATFORM_SECRET.length} characters`);
console.log(`   First 10 chars: "${HANDY_PLATFORM_SECRET.substring(0, 10)}"`);
console.log(`   Last 10 chars: "${HANDY_PLATFORM_SECRET.substring(HANDY_PLATFORM_SECRET.length - 10)}"`);
console.log(`   Contains whitespace: ${/\s/.test(HANDY_PLATFORM_SECRET) ? 'YES (PROBLEM!)' : 'NO'}`);

console.log('\n   CHAT-STACK SECRET (old):');
console.log(`   Length: ${CHAT_STACK_SECRET.length} characters`);
console.log(`   First 10 chars: "${CHAT_STACK_SECRET.substring(0, 10)}"`);
console.log(`   Last 10 chars: "${CHAT_STACK_SECRET.substring(CHAT_STACK_SECRET.length - 10)}"`);
console.log(`   Contains whitespace: ${/\s/.test(CHAT_STACK_SECRET) ? 'YES (PROBLEM!)' : 'NO'}`);
console.log(`   Base64 format: ${/^[A-Za-z0-9+/=]+$/.test(CHAT_STACK_SECRET) ? 'YES' : 'NO'}`);
