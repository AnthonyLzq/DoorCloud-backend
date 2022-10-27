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
pnpm sub
```

We will get the following out put:

```bash
> doorcloud-backend@0.1.0 sub /.../DoorCloud/backend
> ts-node -r dotenv/config src/sub.ts

Connected to mqtt server
Suscribed to DoorCloud/#
```

Once we receive a new message it will be displayed immediately after.

### Sending

To send a message to the `DoorCloud/test` topic we have to run the following command:

```bash
pnpm pub
```

We will get the following out put:

```bash
> doorcloud-backend@0.1.0 pub /Users/anthonylzq/Development/personal-projects/DoorCloud/backend
> ts-node -r dotenv/config src/pub.ts

Message send
Connected to mqtt server
```

Finally, we may have an output as follows:

![](basic_pub_sub_test.png)
