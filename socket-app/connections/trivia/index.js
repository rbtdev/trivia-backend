const SocketApp = require('../../socket-app');
const ANSWER_TIME = 30000; // 30 Seconds
const request = require('request');
const START_TIME = 15000;
const MAX_PLAYERS = 10
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
class Game {
  constructor(opts) {
    console.log("strting new game");
    this.players = opts.players;
    this.room = opts.room;
    this.anwerTimer = null;
    this.nextQuestionTimer = null;
    this.sendQuestion();
  }
  getNextQuestion(cb) {
    request.get('https://opentdb.com/api.php?amount=1', (err, response) => {
      if (err) return cb(err)
      let body = {};
      try {
        body = JSON.parse(response.body);
      } catch (ex) {
        return cb(ex);
      }
      if (body.results.length >= 0) return cb(null, body.results[0])
      else cb('No question returned')
    });
  }

  sendQuestion() {
    let _this = this;
    let playerList = this.players.map(player =>{
      return {
        username: player.username,
        score: player.score
      }
    })
    this.players.forEach(player =>{
      player.socket.emit("player-list", playerList)
    })
    this.answerCount = 0;
    this.nextQuestionTimer = setTimeout(() => {
      _this.getNextQuestion((err, question) => {
        if (err) return console.log('Error getting question' + err);
        _this.currentQuestion = question;
        _this.currentQuestion.points = ['', 'easy', 'medium', 'hard'].indexOf(_this.currentQuestion.difficulty) * 5;
        let answers = shuffle([_this.currentQuestion.correct_answer].concat(_this.currentQuestion.incorrect_answers));
        console.log("sending question");
        _this.room.emit('question', {
          question: _this.currentQuestion.question,
          category: _this.currentQuestion.category,
          points: _this.currentQuestion.points,
          answers: answers
        });
        _this.players.forEach((player) => {
          player.socket.on('answer', _this.checkAnswer.bind(_this, player));
        })
      })
    }, 2000)
  }
  checkAnswer(player, answer) {
    this.answerCount++;
    player.socket.removeAllListeners('answer');
    if (answer === this.currentQuestion.correct_answer) {
      player.score += this.currentQuestion.points;
      player.socket.emit('right', player.score);
    } else {
      player.socket.emit('wrong', this.currentQuestion.correct_answer);
    }
    if (this.answerCount >= this.players.length) {
      this.sendQuestion();
    }
  }
  stop() {
    clearTimeout(this.answerTimer);
    clearTimeout(this.nextQuestionTimer);
  }
}
class Trivia extends SocketApp {
  constructor(io, connectionName) {
    super(io, connectionName);
    this.io = io;
    this.games = []; // creates an empty array of game rooms
    this.gameId = 0; // creates a UUI for the game room
    this.players = [] // creates an empty array of playes
  }
  onConnect(socket) {
    let _this = this;
    if (this.players.length < MAX_PLAYERS) {
      socket.on('signin', (username) => {
        _this.players.push({
          username: username,
          socket: socket,
          score: 0
        })
        let roomId = 'game-' + _this.gameId;
        socket.join(roomId, () => {
          socket.emit('waiting')
          if (this.players.length === 1){
            _this.startTimer = setTimeout(()=>{
              _this.games.push(new Game({
                room: _this.server.in(roomId),
                players: _this.players,
              }))
            },START_TIME)
          }
          if (_this.players.length === MAX_PLAYERS) {
            clearTimeout(_this.startTimer);
            _this.games.push(new Game({
              room: _this.server.in(roomId),
              players: _this.players,
            }))
            _this.gameId++;
          }
        }) //makes a unique id for game
      })
    }
    socket.on('disconnect', () => { })
  }
}
module.exports = Trivia;
