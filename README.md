# Upload anything to the server

First of all, you need to add a `config.json` file in the config folder.

The server config should like this:

```json
{
  "servers": {
    "prod": {
      "host": "192.168.1.1",
      "port": 22,
      "username": "hello",
      "password": "world"
    },
    "test": {
      "host": "192.168.1.2",
      "port": 22,
      "username": "hello",
      "password": "world"
    }
  }
}
```
