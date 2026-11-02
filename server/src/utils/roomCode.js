/** Room-code utility: creates a random code for joining a game room. */
// Generate a short human-readable room code; the character set avoids confusing symbols.
const generateRoomCode = (length = 6) => {
  const characters = "ABCDEFGHJKLMNOPQRSTUVWXYZ23456789";

  let code = "";

  // Select one random character for each position in the requested code length.
  for (let i = 0; i < length; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
};

export default generateRoomCode;
