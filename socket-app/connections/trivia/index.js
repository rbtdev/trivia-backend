const SocketApp = require('../../socket-app');
const axios = require('axios');
const ShortUID = require('short-unique-id').default;

const ANSWER_TIME = 30000; // 30 Seconds
const GET_READY_TIME = 5000;
const MAX_PLAYERS = 1;
/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

const sleep = ms => (new Promise(resolve => (setTimeout(resolve, ms))));

class Game {
  constructor(room) {
    console.log("starting new game");
    this.waitingPlayers = [];
    this.players = [];
    this.room = room;
    this.isStarted = false;
  }

  broadcast = (event, data) => this.players.forEach(player => player.socket.emit(event, data));

  scoreList = () => this.players.map(player => ({ username: player.username, score: player.score }));

  sendScores = () => this.broadcast('scorelist', this.scoreList());

  getQuestions = async (count) => {
    let response = await axios.get(`https://opentdb.com/api.php?amount=${count}`);
    if (!response.status === 200) return [];
    let questions = response.data.results.map((questionData, index) => {
      let question = {
        ...questionData,
        number: index + 1,
        points: ['', 'easy', 'medium', 'hard'].indexOf(questionData.difficulty) * 5,
        answers: shuffle([questionData.correct_answer].concat(questionData.incorrect_answers)),
      }
      return question;
    });
    return questions;
  }

  //
  // Start a new question round
  //
  startNewQuestion = async (questionData) => {

    // If we have players waiting to get in, add them to the player list now
    this.players = this.players.concat(this.waitingPlayers);
    this.waitingPlayers = [];
    this.sendScores();
    this.broadcast('getready');
    await sleep(GET_READY_TIME);
    if (!questionData) return console.error('no question');
    let { question, category, points, answers, number } = questionData;
    console.log(`Sending question ${questionData.number}`)
    this.broadcast('question', { question, category, points, answers, number }, ANSWER_TIME);
  }

  //
  // Create an async (Promise) function to wait for and check all
  // answers from players (or timeouts)
  //
  // Resolve when either all players have answered, or timedout
  //
  checkAnswers = (question) => {
    return new Promise(resolve => {
      const checkPlayerAnswer = (player, answer) => {
        // remove player from waitingFor list
        let index = waitingFor.findIndex(_player => (player.id === _player.id));
        waitingFor.splice(index, 1);

        // Remove answer listener for this player
        player.socket.removeAllListeners('answer');

        // Check if answer is correct and increment player score, send player result
        if (answer === question.correct_answer) {
          player.score += question.points;
          player.socket.emit('right', question.points, answer);
        } else player.socket.emit('wrong', question.correct_answer, answer);

        // If everyone has answered send scores and start a new question
        if (waitingFor.length === 0) {
          console.log('Everyone has answered, clearing question timeout')
          clearTimeout(questionTimer);
          resolve();
        }
      }

      let waitingFor = [...this.players];
      let questionTimer = setTimeout(() => {
        // Clear any lingering answer listeners
        waitingFor.forEach(player => player.socket.emit('wrong', question.correct_answer, ''));
        waitingFor.forEach(player => player.socket.removeAllListeners('answer'));
        resolve();
      }, ANSWER_TIME); // ASet a timeout for anaswers
      this.players.forEach(player => player.socket.on('answer', answer => checkPlayerAnswer(player, answer)));
    })
  }

  //
  // Main game loop:
  //   set isStarted to true
  //   Get all questions for the game
  //   iterate through questions
  //      send a question
  //      wait for answers (or timeout)
  //      send scores
  //  Stop game when all questions have been sent
  //
  async start() {
    this.isStarted = true;
    let questions = await this.getQuestions(100);
    for (let question of questions) {
      await this.startNewQuestion(question);
      await this.checkAnswers(question);
      this.sendScores();
    }
    this.stop();
  }

  stop() {
    this.isStarted = false;
    console.log('Everyone left, stopping game');
    this.broadcast('game-over');
  }

  join(player) {
    this.broadcast('player-joined', { username: player.username });
    if (this.isStarted) {
      player.socket.emit('waiting');
      this.waitingPlayers.push({ ...player, score: 0 });
    } else {
      this.players.push({ ...player, score: 0 });
      if (this.players.length >= MAX_PLAYERS) this.start();
    }


    // Handle a player leaving the game
    player.socket.on('disconnect', () => {
      let list = this.players;
      let index = list.findIndex(_player => (_player.id === player.id));
      if (index === -1) {
        list = this.waitingPlayers;
        index = list.findIndex(_player => (_player.id === player.id));
      }
      if (index > -1) list.splice(index, 1);
      this.broadcast('player-left', { username: player.username });
      this.sendScores();
      if (this.players.length === 0) this.stop();
    })
  }
}

class Trivia extends SocketApp {
  constructor(io, connectionName) {
    super(io, connectionName);
    this.io = io;
    this.games = {}; // creates an empty array of game rooms
    this.uid = new ShortUID({
      dictionary: [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ']
    });
  }


  onConnect(socket) {

    const joinGame = (socket) => (gameId, username) => {
      let player = {
        username: username,
        socket: socket,
        id: this.uid.randomUUID(8)
      }

      socket.join(gameId, () => {
        if (!this.games[gameId]) return socket.emit('signin', 'invalid-game');
        this.games[gameId].join(player);
        socket.emit('signin'.null);
      });
    }

    const createGame = socket => () => {
      let gameId = this.uid.randomUUID(6)
      ''.str;
      let room = this.server.in(gameId);
      this.games[gameId] = new Game(room);
      socket.emit('game-created', gameId);
    }

    socket.on('create-game', createGame(socket));
    socket.on('signin', joinGame(socket));
  }
}

module.exports = Trivia;
