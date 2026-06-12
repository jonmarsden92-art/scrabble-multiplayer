cat > server.js << 'EOF'
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== FULL SCRABBLE DICTIONARY =====
console.log('📚 Loading Scrabble dictionary...');

// Load dictionary from file or use built-in list
let validWords = new Set();

try {
  // Try to load TWL dictionary first
  if (fs.existsSync('twl.txt')) {
    const dictionary = fs.readFileSync('twl.txt', 'utf8');
    const words = dictionary.split('\n');
    words.forEach(word => {
      const trimmed = word.trim().toUpperCase();
      if (trimmed.length >= 2) {
        validWords.add(trimmed);
      }
    });
    console.log(`✅ Loaded ${validWords.size} words from TWL dictionary`);
  } 
  // Try SOWPODS as fallback
  else if (fs.existsSync('sowpods.txt')) {
    const dictionary = fs.readFileSync('sowpods.txt', 'utf8');
    const words = dictionary.split('\n');
    words.forEach(word => {
      const trimmed = word.trim().toUpperCase();
      if (trimmed.length >= 2) {
        validWords.add(trimmed);
      }
    });
    console.log(`✅ Loaded ${validWords.size} words from SOWPODS dictionary`);
  }
  else {
    // Fallback to built-in word list
    console.log('⚠️ No dictionary file found. Using built-in word list.');
    const basicWords = [
      'AA', 'AB', 'AD', 'AE', 'AG', 'AH', 'AI', 'AL', 'AM', 'AN', 'AR', 'AS', 'AT', 'AW', 'AX', 'AY',
      'BA', 'BE', 'BI', 'BO', 'BY', 'DA', 'DE', 'DO', 'ED', 'EF', 'EH', 'EL', 'EM', 'EN', 'ER', 'ES',
      'ET', 'EX', 'FA', 'FE', 'GI', 'GO', 'HA', 'HE', 'HI', 'HM', 'HO', 'ID', 'IF', 'IN', 'IO', 'IS',
      'IT', 'JO', 'KA', 'KI', 'LA', 'LI', 'LO', 'MA', 'ME', 'MI', 'MM', 'MO', 'MU', 'MY', 'NA', 'NE',
      'NO', 'NU', 'OD', 'OE', 'OF', 'OH', 'OI', 'OM', 'ON', 'OP', 'OR', 'OS', 'OW', 'OX', 'OY', 'PA',
      'PE', 'PI', 'PO', 'QI', 'RE', 'SH', 'SI', 'SO', 'ST', 'TA', 'TE', 'TI', 'TO', 'UG', 'UH', 'UM',
      'UN', 'UP', 'US', 'UT', 'WE', 'WO', 'XI', 'XU', 'YA', 'YE', 'YO', 'ZA',
      'CAT', 'DOG', 'BIRD', 'FISH', 'HAT', 'BAT', 'RAT', 'CAR', 'BUS', 'TRAIN',
      'HOUSE', 'TREE', 'FLOWER', 'SUN', 'MOON', 'STAR', 'HELLO', 'WORLD', 'GAME',
      'PLAY', 'WORD', 'TILE', 'RACK', 'SCORE', 'TURN', 'MULTI', 'PLAYER', 'APPLE',
      'BANANA', 'CHERRY', 'GRAPE', 'LEMON', 'ORANGE', 'PEAR', 'RED', 'BLUE', 'GREEN',
      'YELLOW', 'BLACK', 'WHITE', 'HAPPY', 'SAD', 'BIG', 'SMALL', 'FAST', 'SLOW',
      'HOT', 'COLD', 'WET', 'DRY', 'RUN', 'WALK', 'JUMP', 'SWIM', 'FLY', 'SIT',
      'STAND', 'EAT', 'DRINK', 'SLEEP', 'MOM', 'DAD', 'SCHOOL', 'BOOK', 'PENCIL',
      'PAPER', 'COMPUTER', 'PHONE', 'MUSIC', 'MOVIE', 'SPORT'
    ];
    basicWords.forEach(word => validWords.add(word));
    console.log(`✅ Loaded ${validWords.size} words from built-in list`);
  }
} catch (error) {
  console.error('Error loading dictionary:', error);
  console.log('⚠️ Using minimal word list');
}

function isValidWord(word) {
  if (word.length < 2) {
    return false;
  }
  
  const upperWord = word.toUpperCase();
  const isValid = validWords.has(upperWord);
  
  if (!isValid) {
    console.log(`   ❌ "${word}" is not in dictionary`);
  }
  
  return isValid;
}

// ===== GAME LOGIC =====
const games = new Map();
const BOARD_SIZE = 15;
const RACK_SIZE = 7;
const BINGO_BONUS = 50;

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

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createLetterBag() {
  let bag = [];
  letterDistribution.forEach(({ letter, count }) => {
    for (let i = 0; i < count; i++) bag.push(letter);
  });
  return shuffleArray(bag);
}

function drawLetters(bag, count) {
  const drawn = [];
  for (let i = 0; i < count && bag.length > 0; i++) {
    drawn.push(bag.pop());
  }
  return { drawn, bag };
}

function createEmptyBoard() {
  return Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
}

function getGameState(game) {
  return {
    board: game.board,
    players: {
      1: { 
        name: game.players[1].name, 
        score: game.players[1].score, 
        rack: game.players[1].rack 
      },
      2: game.players[2] ? { 
        name: game.players[2].name, 
        score: game.players[2].score, 
        rack: game.players[2].rack 
      } : { 
        name: 'Waiting...', 
        score: 0, 
        rack: [] 
      }
    },
    currentTurn: game.currentTurn,
    status: game.status
  };
}

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  
  socket.on('createGame', ({ playerName }) => {
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const bag = createLetterBag();
    const board = createEmptyBoard();
    
    const { drawn: rack1, bag: newBag1 } = drawLetters([...bag], RACK_SIZE);
    const { drawn: rack2, bag: newBag2 } = drawLetters(newBag1, RACK_SIZE);
    
    const game = {
      id: gameId,
      board: board,
      players: {
        1: { socketId: socket.id, name: playerName, score: 0, rack: rack1 },
        2: null
      },
      currentTurn: 1,
      bag: newBag2,
      status: 'waiting'
    };
    
    games.set(gameId, game);
    socket.join(gameId);
    
    console.log(`✅ Game created: ${gameId} by ${playerName}`);
    console.log(`   Player 1 rack: ${rack1.join(', ')}`);
    
    socket.emit('gameCreated', {
      success: true,
      gameId: gameId,
      playerNum: 1,
      gameState: getGameState(game)
    });
  });
  
  socket.on('joinGame', ({ gameId, playerName }) => {
    console.log(`🎮 Join attempt: ${playerName} -> ${gameId}`);
    const game = games.get(gameId);
    
    if (!game) {
      console.log(`❌ Game ${gameId} not found`);
      socket.emit('joinFailed', { error: 'Game not found' });
      return;
    }
    
    if (game.players[2] !== null) {
      console.log(`❌ Game ${gameId} is full`);
      socket.emit('joinFailed', { error: 'Game is full' });
      return;
    }
    
    const { drawn: rack2, bag: newBag } = drawLetters([...game.bag], RACK_SIZE);
    
    game.players[2] = {
      socketId: socket.id,
      name: playerName,
      score: 0,
      rack: rack2
    };
    game.bag = newBag;
    game.status = 'playing';
    
    socket.join(gameId);
    
    console.log(`✅ ${playerName} joined game ${gameId}`);
    console.log(`   Player 2 rack: ${rack2.join(', ')}`);
    
    const gameState = getGameState(game);
    
    socket.emit('gameJoined', {
      success: true,
      playerNum: 2,
      gameState: gameState
    });
    
    socket.emit('gameStateUpdate', gameState);
    
    const player1Socket = game.players[1].socketId;
    console.log(`📤 Sending game update to Player 1 (${player1Socket})`);
    io.to(player1Socket).emit('gameStateUpdate', gameState);
    io.to(player1Socket).emit('playerJoined', { 
      message: `${playerName} has joined!`,
      gameState: gameState 
    });
    
    io.to(gameId).emit('gameReady', { gameState: gameState });
  });
  
  socket.on('playWord', ({ gameId, word, placements, score }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('playFailed', { error: 'Game not found' });
      return;
    }
    
    let playerNum = null;
    if (game.players[1] && game.players[1].socketId === socket.id) playerNum = 1;
    else if (game.players[2] && game.players[2].socketId === socket.id) playerNum = 2;
    
    if (!playerNum) {
      socket.emit('playFailed', { error: 'Not in game' });
      return;
    }
    
    if (game.currentTurn !== playerNum) {
      socket.emit('playFailed', { error: 'Not your turn' });
      return;
    }
    
    console.log(`\n📝 Word attempt: "${word}" by Player ${playerNum}`);
    
    // CHECK IF WORD IS VALID WITH FULL DICTIONARY
    if (!isValidWord(word)) {
      console.log(`   ❌ Rejected - "${word}" is not a valid Scrabble word`);
      socket.emit('playFailed', { error: `"${word}" is not a valid Scrabble word` });
      return;
    }
    
    console.log(`   ✅ "${word}" is a valid Scrabble word!`);
    console.log(`   Placements:`, placements);
    
    // Apply placements to board
    for (const [pos, letter] of placements) {
      const [row, col] = pos.split(',').map(Number);
      game.board[row][col] = { letter: letter, playedBy: playerNum };
      console.log(`   Placed ${letter} at (${row}, ${col})`);
    }
    
    // Update score
    game.players[playerNum].score += score;
    if (word.length === 7) {
      game.players[playerNum].score += BINGO_BONUS;
      console.log(`   BINGO! +${BINGO_BONUS} bonus`);
    }
    
    // Remove played letters from rack
    const wordLetters = word.split('');
    const currentRack = [...game.players[playerNum].rack];
    
    for (let letter of wordLetters) {
      const index = currentRack.findIndex(l => l === letter);
      if (index !== -1) {
        currentRack.splice(index, 1);
      }
    }
    
    // Draw new letters
    const { drawn, bag } = drawLetters([...game.bag], wordLetters.length);
    game.players[playerNum].rack = [...currentRack, ...drawn];
    game.bag = bag;
    
    // Switch turn
    game.currentTurn = game.currentTurn === 1 ? 2 : 1;
    
    const gameState = getGameState(game);
    gameState.lastPlay = { player: playerNum, word: word, score: score };
    
    console.log(`✅ Word "${word}" played successfully for ${score} points!\n`);
    
    io.to(gameId).emit('gameStateUpdate', gameState);
    socket.emit('playSuccess', { success: true });
  });
  
  socket.on('exchangeTiles', ({ gameId, tiles }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('exchangeFailed', { error: 'Game not found' });
      return;
    }
    
    let playerNum = null;
    if (game.players[1] && game.players[1].socketId === socket.id) playerNum = 1;
    else if (game.players[2] && game.players[2].socketId === socket.id) playerNum = 2;
    
    if (!playerNum) {
      socket.emit('exchangeFailed', { error: 'Not in game' });
      return;
    }
    
    if (game.currentTurn !== playerNum) {
      socket.emit('exchangeFailed', { error: 'Not your turn' });
      return;
    }
    
    if (game.bag.length < tiles.length) {
      socket.emit('exchangeFailed', { error: 'Not enough tiles in bag' });
      return;
    }
    
    console.log(`🔄 Exchanging tiles for Player ${playerNum}: ${tiles.join(', ')}`);
    
    const currentRack = [...game.players[playerNum].rack];
    for (let tile of tiles) {
      const index = currentRack.findIndex(t => t === tile);
      if (index !== -1) currentRack.splice(index, 1);
    }
    
    game.bag.push(...tiles);
    game.bag = shuffleArray(game.bag);
    
    const { drawn, bag } = drawLetters([...game.bag], tiles.length);
    game.players[playerNum].rack = [...currentRack, ...drawn];
    game.bag = bag;
    game.currentTurn = game.currentTurn === 1 ? 2 : 1;
    
    const gameState = getGameState(game);
    io.to(gameId).emit('gameStateUpdate', gameState);
    socket.emit('exchangeSuccess', { success: true });
  });
  
  socket.on('passTurn', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('passFailed', { error: 'Game not found' });
      return;
    }
    
    let playerNum = null;
    if (game.players[1] && game.players[1].socketId === socket.id) playerNum = 1;
    else if (game.players[2] && game.players[2].socketId === socket.id) playerNum = 2;
    
    if (!playerNum) {
      socket.emit('passFailed', { error: 'Not in game' });
      return;
    }
    
    if (game.currentTurn !== playerNum) {
      socket.emit('passFailed', { error: 'Not your turn' });
      return;
    }
    
    console.log(`⏭️ Player ${playerNum} passed the turn`);
    
    game.currentTurn = game.currentTurn === 1 ? 2 : 1;
    
    const gameState = getGameState(game);
    io.to(gameId).emit('gameStateUpdate', gameState);
    socket.emit('passSuccess', { success: true });
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    
    for (const [gameId, game] of games.entries()) {
      if (game.players[1] && game.players[1].socketId === socket.id) {
        if (game.players[2]) {
          io.to(game.players[2].socketId).emit('playerDisconnected', { playerNum: 1 });
        }
        games.delete(gameId);
        console.log(`🗑️ Game ${gameId} deleted - Player 1 left`);
      } else if (game.players[2] && game.players[2].socketId === socket.id) {
        if (game.players[1]) {
          io.to(game.players[1].socketId).emit('playerDisconnected', { playerNum: 2 });
        }
        games.delete(gameId);
        console.log(`🗑️ Game ${gameId} deleted - Player 2 left`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} to play\n`);
  console.log(`📚 Dictionary loaded with ${validWords.size} words`);
});
EOF
