# node-browser-webdriver

This repository builds multiple Docker images for different node and browser versions.<br/>
It gives you the ability to keep up to date your versions on development environments, continuous integration and deployment. 


## Docker images

All images are based on a specific nodejs image depending on the version.<br/>
The list is available on <a href="https://cloud.docker.com/repository/docker/devside/node-browser-webdriver">Docker hub</a> or Git tags.

They all contain thoses binaries: 
- node
- npm
- yarn
- zip
- git
- other Debian binaries ...

## Development environment

It is not easy to be sure the developer teammates use the same browser version on their machine and as **Chrome cannot be downgraded**, it is safer to dockerize Chrome and its driver.

In dev mode, you may want to keep your web server outside the container. In this case, the host ip from the container is `host.docker.internal` (on docker v18). So when the webdriver has to visit your website to test it, it has to use it instead of `localhost`.


### Chrome + Chromedriver

chromedriver has to whitelist your host ip, here is a `docker-compose.yml` example


```yml
version: '3'
services:
  web:
    image: devside/node-browser-webdriver:chrome75.0.3770.80-node12.4.0
    command: |
      /bin/bash -c "
        export CHROMEDRIVER_HOST_IP=\"$$(ip route | awk '/default/ { print $$3 }')\" \
        && chromedriver --url-base=/wd/hub --port=9515 --whitelisted-ips=\"$$CHROMEDRIVER_HOST_IP\"
      "
    ports:
      - "9515:9515"
```

Then you have to run `docker-compose up`

### Firefox + Ghekodriver

Work in progress...

## CI environment

### Chrome + Chromedriver

Here is an example of a `gitlab.yml` where the container is used to build, serve and test your app.

```yml
test:
  image: devside/node-browser-webdriver:chrome75.0.3770.80-node12.4.0
  script:
    # - yarn install, npm install, ...
    # - build, serve, ...
    - chromedriver --url-base=/wd/hub --port=9515
    # - test ...
```

### Firefox + Ghekodriver

Work in progress...
