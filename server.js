const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Game state storage
const games = new Map(); // gameId -> game object
const players = new Map(); // socketId -> { gameId, playerNum }

// Scrabble constants
const BOARD_SIZE = 15;
const CENTER = { row: 7, col: 7 };
const RACK_SIZE = 7;
const BINGO_BONUS = 50;

// Letter distribution (same as frontend)
const letterDistribution = [
  { letter: 'A', count: 9, score: 1 }, { letter: 'B', count: 2, score: 3 },
  { letter: 'C', count: 2, score: 3 }, { letter: 'D', count: 4, score: 2 },
  { letter: 'E', count: 12, score: 1 }, { letter: 'F', count: 2, score: 4 },
  { letter: 'G', count: 3, score: 2 }, { letter: 'H', count: 2, score: 4 },
  { letter: 'I', count: 9, score: 1 }, { letter: 'J', count: 1, score: 8 },
  { letter: 'K', count: 1, score: 5 }, { letter: 'L', count: 4, score: 1 },
  { letter: 'M', count: 2, score: 3 }, { letter: 'N', count: 6, score: 1 },
  { letter: 'O', count: 8, score: 1 }, { letter: 'P', count: 2, score: 3 },
  { letter: 'Q', count: 1, score: 10 }, { letter: 'R', count: 6, score: 1 },
  { letter: 'S', count: 4, score: 1 }, { letter: 'T', count: 6, score: 1 },
  { letter: 'U', count: 4, score: 1 }, { letter: 'V', count: 2, score: 4 },
  { letter: 'W', count: 2, score: 4 }, { letter: 'X', count: 1, score: 8 },
  { letter: 'Y', count: 2, score: 4 }, { letter: 'Z', count: 1, score: 10 },
  { letter: '?', count: 2, score: 0 }
];

// Create letter bag
function createLetterBag() {
  let bag = [];
  letterDistribution.forEach(({ letter, count }) => {
    for (let i = 0; i < count; i++) {
      bag.push(letter);
    }
  });
  return shuffleArray(bag);
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Draw letters from bag
function drawLetters(bag, count) {
  const drawn = [];
  for (let i = 0; i < count && bag.length > 0; i++) {
    drawn.push(bag.pop());
  }
  return { drawn, bag };
}

// Create empty board
function createEmptyBoard() {
  const board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
  return board;
}

// Create new game
function createGame(gameId, player1SocketId, player1Name) {
  const bag = createLetterBag();
  const board = createEmptyBoard();
  
  // Draw initial racks
  const { drawn: rack1, bag: newBag1 } = drawLetters([...bag], RACK_SIZE);
  const { drawn: rack2, bag: newBag2 } = drawLetters(newBag1, RACK_SIZE);
  
  const game = {
    id: gameId,
    board: board,
    players: {
      1: { 
        socketId: player1SocketId, 
        name: player1Name || 'Player 1',
        score: 0,
        rack: rack1,
        ready: false
      },
      2: { 
        socketId: null, 
        name: null, 
        score: 0,
        rack: [],
        ready: false
      }
    },
    currentTurn: 1,
    bag: newBag2,
    status: 'waiting', // waiting, playing, finished
    pendingPlacements: new Map(), // For word validation
    wordList: new Set() // Would load from file in production
  };
  
  return game;
}

// Join game
function joinGame(gameId, socketId, playerName) {
  const game = games.get(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  if (game.players[2].socketId !== null) {
    return { success: false, error: 'Game is full' };
  }
  
  const bag = game.bag;
  const { drawn: rack2, bag: newBag } = drawLetters([...bag], RACK_SIZE);
  
  game.players[2] = {
    socketId: socketId,
    name: playerName || 'Player 2',
    score: 0,
    rack: rack2,
    ready: false
  };
  game.bag = newBag;
  game.status = 'playing';
  
  return { success: true, game };
}

// Get letter score
function getLetterScore(letter) {
  if (letter === '?') return 0;
  const found = letterDistribution.find(l => l.letter === letter);
  return found ? found.score : 1;
}

// Calculate word score (simplified - would need full implementation)
function calculateWordScore(word, placements, board) {
  let total = 0;
  for (let char of word) {
    total += getLetterScore(char);
  }
  return total;
}

// Simple dictionary check (would need full dictionary file)
function isValidWord(word) {
  // This is a simplified version - in production, load a real dictionary
  if (word.length < 2) return false;
  // Common words for demo
  const commonWords = new Set(['CAT', 'DOG', 'BIRD', 'FISH', 'HAT', 'BAT', 'RAT', 
    'CAR', 'BUS', 'TRAIN', 'HOUSE', 'TREE', 'FLOWER', 'SUN', 'MOON', 'STAR']);
  return commonWords.has(word.toUpperCase()) || word.length >= 2;
}

// Check if placement is valid
function isValidPlacement(placements, board, currentTurn) {
  if (!placements || placements.size === 0) return false;
  
  // Check all placements are adjacent
  const positions = Array.from(placements.keys());
  if (positions.length === 0) return false;
  
  // Check if first move is on center
  const firstMove = Array.from(board.flat()).every(cell => cell === null);
  if (firstMove) {
    const centerPlaced = positions.some(pos => {
      const [row, col] = pos.split(',').map(Number);
      return row === 7 && col === 7;
    });
    if (!centerPlaced) return false;
  }
  
  return true;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Create new game
  socket.on('createGame', ({ playerName }, callback) => {
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game = createGame(gameId, socket.id, playerName);
    games.set(gameId, game);
    players.set(socket.id, { gameId, playerNum: 1 });
    
    socket.join(gameId);
    
    callback({
      success: true,
      gameId: gameId,
      playerNum: 1,
      gameState: {
        board: game.board,
        players: {
          1: { name: game.players[1].name, score: game.players[1].score, rack: game.players[1].rack },
          2: { name: 'Waiting for player...', score: 0, rack: [] }
        },
        currentTurn: game.currentTurn,
        status: game.status
      }
    });
    
    console.log(`Game created: ${gameId} by ${playerName}`);
  });
  
  // Join existing game
  socket.on('joinGame', ({ gameId, playerName }, callback) => {
    const result = joinGame(gameId, socket.id, playerName);
    
    if (result.success) {
      const game = result.game;
      players.set(socket.id, { gameId, playerNum: 2 });
      socket.join(gameId);
      
      // Notify both players
      io.to(gameId).emit('gameStateUpdate', {
        board: game.board,
        players: {
          1: { name: game.players[1].name, score: game.players[1].score, rack: game.players[1].rack },
          2: { name: game.players[2].name, score: game.players[2].score, rack: game.players[2].rack }
        },
        currentTurn: game.currentTurn,
        status: game.status,
        bagCount: game.bag.length
      });
      
      callback({ success: true, playerNum: 2 });
      console.log(`${playerName} joined game ${gameId}`);
    } else {
      callback({ success: false, error: result.error });
    }
  });
  
  // Submit word play
  socket.on('playWord', ({ gameId, word, placements, score }, callback) => {
    const game = games.get(gameId);
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    
    const playerData = players.get(socket.id);
    if (!playerData || playerData.gameId !== gameId) {
      callback({ success: false, error: 'Not in game' });
      return;
    }
    
    if (game.currentTurn !== playerData.playerNum) {
      callback({ success: false, error: 'Not your turn' });
      return;
    }
    
    // Validate word (simplified)
    if (!isValidWord(word)) {
      callback({ success: false, error: 'Invalid word' });
      return;
    }
    
    // Apply placements to board
    for (const [pos, letter] of placements) {
      const [row, col] = pos.split(',').map(Number);
      game.board[row][col] = { letter: letter, score: getLetterScore(letter), playedBy: playerData.playerNum };
    }
    
    // Update score
    game.players[playerData.playerNum].score += score;
    if (word.length === 7) game.players[playerData.playerNum].score += BINGO_BONUS;
    
    // Remove played letters from rack
    const wordLetters = word.split('');
    const currentRack = [...game.players[playerData.playerNum].rack];
    for (let letter of wordLetters) {
      const index = currentRack.findIndex(l => l === letter || (l === '?' && letter !== '?'));
      if (index !== -1) currentRack.splice(index, 1);
    }
    
    // Draw new letters
    const { drawn, bag } = drawLetters([...game.bag], wordLetters.length);
    game.players[playerData.playerNum].rack = [...currentRack, ...drawn];
    game.bag = bag;
    
    // Switch turn
    game.currentTurn = game.currentTurn === 1 ? 2 : 1;
    
    // Broadcast update
    io.to(gameId).emit('gameStateUpdate', {
      board: game.board,
      players: {
        1: { name: game.players[1].name, score: game.players[1].score, rack: game.players[1].rack },
        2: { name: game.players[2].name, score: game.players[2].score, rack: game.players[2].rack }
      },
      currentTurn: game.currentTurn,
      status: game.status,
      bagCount: game.bag.length,
      lastPlay: { player: playerData.playerNum, word: word, score: score }
    });
    
    callback({ success: true });
    console.log(`Word played in ${gameId}: ${word} for ${score} points`);
  });
  
  // Exchange tiles
  socket.on('exchangeTiles', ({ gameId, tiles }, callback) => {
    const game = games.get(gameId);
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    
    const playerData = players.get(socket.id);
    if (!playerData || playerData.gameId !== gameId) {
      callback({ success: false, error: 'Not in game' });
      return;
    }
    
    if (game.currentTurn !== playerData.playerNum) {
      callback({ success: false, error: 'Not your turn' });
      return;
    }
    
    if (game.bag.length < tiles.length) {
      callback({ success: false, error: 'Not enough tiles in bag' });
      return;
    }
    
    // Remove tiles from rack and add to bag
    const currentRack = [...game.players[playerData.playerNum].rack];
    for (let tile of tiles) {
      const index = currentRack.findIndex(t => t === tile);
      if (index !== -1) currentRack.splice(index, 1);
    }
    
    // Add exchanged tiles back to bag and shuffle
    game.bag.push(...tiles);
    game.bag = shuffleArray(game.bag);
    
    // Draw new tiles
    const { drawn, bag } = drawLetters([...game.bag], tiles.length);
    game.players[playerData.playerNum].rack = [...currentRack, ...drawn];
    game.bag = bag;
    
    // Switch turn
    game.currentTurn = game.currentTurn === 1 ? 2 : 1;
    
    // Broadcast update
    io.to(gameId).emit('gameStateUpdate', {
      board: game.board,
      players: {
        1: { name: game.players[1].name, score: game.players[1].score, rack: game.players[1].rack },
        2: { name: game.players[2].name, score: game.players[2].score, rack: game.players[2].rack }
      },
      currentTurn: game.currentTurn,
      status: game.status,
      bagCount: game.bag.length
    });
    
    callback({ success: true });
    console.log(`Tiles exchanged in ${gameId}`);
  });
  
  // Pass turn
  socket.on('passTurn', ({ gameId }, callback) => {
    const game = games.get(gameId);
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    
    const playerData = players.get(socket.id);
    if (!playerData || playerData.gameId !== gameId) {
      callback({ success: false, error: 'Not in game' });
      return;
    }
    
    if (game.currentTurn !== playerData.playerNum) {
      callback({ success: false, error: 'Not your turn' });
      return;
    }
    
    // Switch turn
    game.currentTurn = game.currentTurn === 1 ? 2 : 1;
    
    // Broadcast update
    io.to(gameId).emit('gameStateUpdate', {
      board: game.board,
      players: {
        1: { name: game.players[1].name, score: game.players[1].score, rack: game.players[1].rack },
        2: { name: game.players[2].name, score: game.players[2].score, rack: game.players[2].rack }
      },
      currentTurn: game.currentTurn,
      status: game.status,
      bagCount: game.bag.length
    });
    
    callback({ success: true });
    console.log(`Turn passed in ${gameId}`);
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const playerInfo = players.get(socket.id);
    
    if (playerInfo) {
      const game = games.get(playerInfo.gameId);
      if (game) {
        // Notify other player
        socket.to(playerInfo.gameId).emit('playerDisconnected', {
          playerNum: playerInfo.playerNum
        });
        
        // Clean up game if needed
        setTimeout(() => {
          const stillConnected = io.sockets.adapter.rooms.get(playerInfo.gameId);
          if (!stillConnected || stillConnected.size === 0) {
            games.delete(playerInfo.gameId);
            console.log(`Game ${playerInfo.gameId} deleted (no players)`);
          }
        }, 5000);
      }
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
