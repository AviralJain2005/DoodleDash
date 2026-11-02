/** Word utilities: provides a random word and a shuffled set of choices for each turn. */
// Small word bank used by the drawer word-selection phase.
const words = [
  "apple",
  "banana",
  "car",
  "house",
  "tree",
  "dog",
  "cat",
  "elephant",
  "pizza",
  "rocket",
  "computer",
  "guitar",
  "sun",
  "moon",
  "book",
  "football",
  "airplane",
  "flower",
  "mountain",
  "robot",
];

// Return one random word from the word bank.
const getRandomWord = () => {
  const index = Math.floor(Math.random() * words.length);

  return words[index];
};

export default getRandomWord; // Return up to `count` distinct choices by shuffling a copy of the word bank.
export const getWordChoices = (count = 3) => {
  const pool = [...words];
  // Fisher–Yates shuffle: swap each position with a randomly selected earlier position.
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.min(count, pool.length));
};
