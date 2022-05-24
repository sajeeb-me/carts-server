const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rmytb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const partCollection = client.db("carts").collection("parts");
        const reviewCollection = client.db("carts").collection("reviews");
        const userCollection = client.db("carts").collection("users");
        const orderCollection = client.db("carts").collection("orders");
        const paymentCollection = client.db("carts").collection("payments");

        // get items 
        app.get('/part', async (req, res) => {
            const part = (await partCollection.find().toArray()).reverse();
            res.send(part)
        })
        app.get('/part/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const part = await partCollection.findOne(filter);
            res.send(part)
        })

        app.get('/order', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const query = { email }
            const order = (await orderCollection.find(query).toArray()).reverse();
            res.send(order)
        })
        app.get('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const order = await orderCollection.findOne(filter);
            res.send(order)
        })

        app.get('/review', async (req, res) => {
            const review = (await reviewCollection.find().toArray()).reverse();
            res.send(review)
        })


        // post
        app.post('/order', verifyJWT, async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result)
        })

        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })


        // put
        app.put('/user/:email', async (req, res) => {
            const filter = req.params;
            const user = req.body;
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const secretToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, secretToken })
        })


        // patch
        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const paymentInfo = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    // paid: true,
                    transitionId: paymentInfo.transitionId
                }
            }
            const result = await orderCollection.updateOne(filter, updateDoc);
            const payment = await paymentCollection.insertOne(paymentInfo);
            res.send({ result, payment })
        })

        app.patch('/profile/:email', async (req, res) => {
            const filter = req.params;
            const profile = req.body;
            const updateDoc = { $set: profile };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)
        })


        // delete
        app.delete('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        })


    } catch (error) {
        console.log(error);
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World from CARTS!')
})

app.listen(port, () => {
    console.log(`Carts is listening on port ${port}`)
})