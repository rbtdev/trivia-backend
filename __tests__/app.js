const request = require('supertest')
const app = require('../app')


jest.mock('../models/person')

describe("App", ()=>{
  it("Tests the root path", ()=>{
    return request(app).get("/").then(response => {
      expect(response.statusCode).toBe(200)
    })
  })

  it("Lists people", ()=>{
  return request(app).get("/person").then(response =>{
    expect(response.statusCode).toBe(200)
    expect(response.body.person[0].username).toBe('katertot')
        })
    })

  it("Creates people", ()=>{
  return request(app)
    .post("/person")
    .send({
      username: 'Kate',
      password: "test123"
    })
    .then(response => {
      expect(response.statusCode).toBe(201)
      expect(response.body.person.username).toBe('Kate')
      expect(response.body.person.password).toBe('test123')
    })
})

it("Validates name when creating person", ()=>{
  return request(app)
    .post("/person")
    .send({
      password: "test123"
    })
    .then(response =>{
      expect(response.statusCode).toBe(400)
      const error = response.body.errors.validations[0]
      expect(error.param).toBe('username')
      expect(error.msg).toBe('is required')
    })
})
})
