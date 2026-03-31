local key = KEYS[1]
local session = redis.call('GET', key)
if not session then
  return 0
end
local data = cjson.decode(session)
if data.used == true then
  return 0
end
data.used = true
redis.call('SET', key, cjson.encode(data), 'EX', 65)
return 1
