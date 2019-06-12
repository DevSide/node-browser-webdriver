const fetch = require('node-fetch')

fetch(`https://chat.googleapis.com/v1/spaces/AAAADVFkEvM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=${process.env.TOKEN}`, {
  method: 'post',
  body:    JSON.stringify({
    text: "TEST webhook 💥."
  }),
  headers: { 'Content-Type': 'application/json' },
})
  .then(res => res.json())
  .then(json => console.log('post message done'));
