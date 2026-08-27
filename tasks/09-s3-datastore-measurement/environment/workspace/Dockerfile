FROM node:14.19.1-alpine
LABEL maintainer="daniel.wasserlauf@meteringco.tech"

LABEL version="1.0"
LABEL description="This is the MeteringCo image"

WORKDIR /meteringco
COPY . /meteringco/

CMD ["npm", "run", "start:generic"]