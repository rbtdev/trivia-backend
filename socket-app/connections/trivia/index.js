const SocketApp = require('../../socket-app');
const axios = require('axios');
const ShortUID = require('short-unique-id').default;

const ANSWER_TIME = 10000; // 30 Seconds

const START_TIME = 15000;
const GET_READY_TIME = 2000;
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
  constructor(room, onStopped) {
    console.log("starting new game");
    this.questions = [];
    this.questionNumber = 0;
    this.waitingPlayers = [];
    this.players = [];
    this.room = room;
    this.answerTimer = null;
    this.questionTimer = null;
    this.answerCount = 0;
    this.isStarted = false;
  }

  broadcast = (event, data) => this.players.forEach(player => this.sendTo(player, event, data));

  sendTo = (player, event, data) => player.socket.emit(event, data);

  scoreList = () => this.players.map(player => ({ username: player.username, score: player.score }));

  sendScores = () => this.broadcast('scorelist', this.scoreList());

  //
  // Start a new question round
  //
  startNewQuestion = async () => {

    //
    // Get a question from the API
    //
    const getNextQuestion =  () => {
      return this.questions[this.questionNumber++] || null;

    }

    //
    // Package and send a question to every player and listen for answers
    //
    const sendQuestion = async (questionData) => {

      //
      // Check if the given player answered correctly and send results
      //
      const checkAnswer = (player, answer) => {
        // Increment answer count and remove player from waiting to answer list
        this.answerCount++;
        
        // Remove answer listener for this player
        player.socket.removeAllListeners('answer');

        // Check if answer is correct and increment player score, send player result
        if (answer === this.currentQuestion.correct_answer) {
          player.score += this.currentQuestion.points;
          this.sendTo(player, 'right', player.score);
        } else this.sendTo(player, 'wrong', this.currentQuestion.correct_answer);

        // If everyone has answered send scores and start a new question
        if (this.answerCount >= this.players.length) {
          console.log('Everyone has answered, clearing question timeout')
          clearTimeout(this.questionTimer);
          this.sendScores();
          this.startNewQuestion();
        }
      }

      // If we have a question to send, 
      // - set points, 
      // - shuffle the answers, 
      // - send it to all players
      // - listen for answers from each player
      if (!questionData) return console.error('no question');
      this.currentQuestion = questionData;
      this.currentQuestion.points = ['', 'easy', 'medium', 'hard'].indexOf(this.currentQuestion.difficulty) * 5;
      let answers = shuffle([this.currentQuestion.correct_answer].concat(this.currentQuestion.incorrect_answers));
      let { question, category, points } = this.currentQuestion;
      this.broadcast('question', { question, category, points, answers }, ANSWER_TIME);
      this.questionTimer = setTimeout(this.startNewQuestion, ANSWER_TIME);

      this.players.forEach(player => player.socket.on('answer', answer => checkAnswer(player, answer)));
    }

    // Clear any lingering answer listeners
    this.players.forEach(player => player.socket.removeAllListeners('answer'));

    // If we have players waiting to get in, add them to the player list now
    this.players = this.players.concat(this.waitingPlayers);
    this.waitingPlayers = [];
    this.sendScores();
    //
    // Notify players to get ready for the next question
    // Wait for a period of time
    // Send and process a question
    this.answerCount = 0;
    this.broadcast('getready');
    let question = getNextQuestion();
    if (!question) this.stop();
    await sleep(GET_READY_TIME);
    sendQuestion(question);
  }

  async start() {
    let response = await axios.get('https://opentdb.com/api.php?amount=20');
    if (!response.status === 200) return null;
    this.questions = response.data.results;
    this.isStarted = true;
    this.startNewQuestion();
  }

  stop() {
    console.log('Everyone left, stopping game');
    this.broadcast('game-over');
    clearTimeout(this.answerTimer);
    clearTimeout(this.questionTimer);
  }

  join(player) {
    this.broadcast('player-joined', { username: player.username });
    if (this.isStarted) {
      this.sendTo(player, 'waiting');
      this.waitingPlayers.push({ ...player, score: 0 });
    } else {
      this.players.push({ ...player, score: 0 });
      if (this.players.length >= MAX_PLAYERS) this.start();
    }


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
