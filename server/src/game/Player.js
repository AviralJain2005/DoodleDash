/** Player model used by Room to track identity, display name, score, and connectivity. */
// Domain model for one participant; the server owns the score and connection status.
class Player {
  // Initialize a newly connected player with no points and an active connection.
  constructor(id, username) {
    this.id = id;
    this.username = username;
    this.score = 0;
    this.connected = true;
  }
}
export default Player;
