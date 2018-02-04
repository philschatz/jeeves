const Redis = require('redis')
const pify = require('pify')

const redisUrl = process.env['REDISCLOUD_URL'] || process.env['REDIS_URL']

module.exports = (robot) => {

  if (!redisUrl) {
    robot.log.error('Missing REDIS_URL environment variable. Consider using REDIS_URL="redis://localhost:6379" for development')
    process.exit(111)
  }

  const client = Redis.createClient(redisUrl)
  const dbDel = pify(client.del.bind(client))
  const dbGet = pify(client.get.bind(client))
  const dbSet = pify(client.set.bind(client))
  const dbSadd = pify(client.sadd.bind(client))
  const dbSmembers = pify(client.smembers.bind(client))
  const dbSrem = pify(client.srem.bind(client))

  robot.brain = {
    del: async (key) => await dbDel(`probot-redis-brain:${key}`),
    jsonGet: async (key) => JSON.parse(await dbGet(`probot-redis-brain:${key}`)),
    jsonSet: async (key, value) => await dbSet(`probot-redis-brain:${key}`, JSON.stringify(value)),
    setAdd: async (key, value) => await dbSadd(`probot-redis-brain:${key}`, value),
    setRemove: async (key) => await dbSrem(`probot-redis-brain:${key}`),
    setMembers: async (key) => await dbSmembers(`probot-redis-brain:${key}`)
  }

  function emit(name, payload) {
    robot.receive({
      event: 'redis-brain',
      payload: {
        ...payload,
        action: name,
        redisClient: client
      }
    })
  }

  function listenTo(name) {
    client.on(name, (payload) => emit(name, payload))
  }

  listenTo('ready')
  listenTo('connect')
  listenTo('reconnecting')
  listenTo('error')
  listenTo('end')
  listenTo('warning')

}
