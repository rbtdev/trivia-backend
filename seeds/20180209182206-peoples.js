'use strict';

module.exports = {
  up: function (queryInterface, Sequelize) {
    return queryInterface.bulkInsert('Person',
      [
        {
          username: 'Josh',
          password: "test123",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          username: 'Eric',
          password: "test123",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          username: 'Oscar',
          password: "test123",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    )
  },

  down: function (queryInterface, Sequelize) {
    return queryInterface.bulkDelete('Person', null, {})
  }
}
