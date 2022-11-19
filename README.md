# Doorcloud Backend

## Prerequisites

To have installed the following:

- [Node.js](https://nodejs.org/) (>= 16)
- [pnpm](https://pnpm.io/) (>= 7)

A `.env` file with the correct variables specified in the `.env.example` file.

## Testing

At this point, we only can test receiving and sending messages.

### Receiving

To subscribe and receive messages in the default topic `DoorCloud` we have to run the following command:

```bash
pnpm service
```

We will get an output as follows:

```bash
> doorcloud-backend@0.1.0 service ~/DoorCloud-backend
> nodemon

[nodemon] 2.0.20
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): .env src/**/*
[nodemon] watching extensions: ts
[nodemon] starting `DEBUG=DoorCloud:* npx ts-node -r dotenv/config ./src/index`
  DoorCloud:Mqtt:sub Connected to mqtt server - Topic: DoorCloud/# +0ms
  DoorCloud:Mqtt:sub Subscribed to Topic: DoorCloud/# +209ms
```

Once we receive a new message it will be displayed immediately after.

### Sending

To send a message to the `DoorCloud/test` topic we have to run the following command:

```bash
pnpm pub
```

We will get the following out put:

```bash
> doorcloud-backend@0.1.0 pub ~/DoorCloud-backend
> DEBUG=DoorCloud:* ts-node -r dotenv/config src/pub.ts

  DoorCloud:Mqtt:pub Message send +0ms
  DoorCloud:Mqtt:pub Connected to mqtt server +1ms
```

Finally, we may have an output as follows:

![](basic_pub_sub_test.png)
