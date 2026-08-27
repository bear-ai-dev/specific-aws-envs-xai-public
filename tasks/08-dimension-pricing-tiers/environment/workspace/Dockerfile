FROM node:18.18.2-alpine
LABEL maintainer="daniel.wasserlauf@meteringco.tech"

LABEL version="1.0"
LABEL description="This is the MeteringCo image"

WORKDIR /meteringco
COPY . /meteringco/

CMD ["npm", "run", "start:generic"]