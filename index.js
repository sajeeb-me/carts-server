const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rmytb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


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


const auth = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY,
        domain: process.env.EMAIL_SENDER_DOMAIN
    }
}

const nodemailerMailgun = nodemailer.createTransport(mg(auth));

function sendPaymentConfirmationEmail(paymentInfo) {
    const { totalPrice, quantity, productName, transitionId, name, address, phone, email } = paymentInfo;

    const emailTemplate = {
        from: process.env.EMAIL_SENDER,
        to: email,
        subject: `Successfully received payment for ${productName}`,
        text: `Successfully received payment for ${productName}`,
        html: `
      <div>
        <p> Hello ${name}, </p>
        <h3>We have received $${totalPrice} for ${productName} (Quantity: ${quantity})</h3>

        <p>You will get your product when your order status on Dashboard will be "Shipped"</p>
        <p>Transition Id: ${transitionId}</p>
        <p>Shipment address: ${address}</p>
        <p>Contact no: ${phone}</p>

        <p>
        <h4>Our Address</h4>
        Zindabazar, Sylhet
        <br/>
        Bangladesh
        <br/>
        <a href="https://carts-68435.web.app/">Thank you</a>
        </p>
      </div>
    `
    };
    nodemailerMailgun.sendMail(emailTemplate, (err, info) => {
        if (err) {
            console.log(err);
        }
        else {
            console.log(info);
        }
    });

}

function sendShipmentInfoEmail(shipmentInfo) {
    const { emailNotification } = shipmentInfo;

    const emailTemplate = {
        from: process.env.EMAIL_SENDER,
        to: emailNotification,
        subject: `Successfully shipped your product`,
        text: `Successfully shipped your product`,
        html: `
      <div>
        <p> Hello, </p>
        <h3>Your product is shipped successfully</h3>

        <p>Thanks for shopping with us!</p>

        <p>Please drop your valuable feedback on "Add a review" Section.</p>

        <p>
        <h4>Our Address</h4>
        Zindabazar, Sylhet
        <br/>
        Bangladesh
        <br/>
        <a href="https://carts-68435.web.app/">Thank you</a>
        </p>
      </div>
    `
    };
    nodemailerMailgun.sendMail(emailTemplate, (err, info) => {
        if (err) {
            console.log(err);
        }
        else {
            console.log(info);
        }
    });
}

async function run() {
    try {
        await client.connect();
        const partCollection = client.db("carts").collection("parts");
        const reviewCollection = client.db("carts").collection("reviews");
        const userCollection = client.db("carts").collection("users");
        const orderCollection = client.db("carts").collection("orders");
        const paymentCollection = client.db("carts").collection("payments");

        // verifyAdmin 
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'Forbidden access' })
            }
        }

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

        app.get('/all-order', verifyJWT, verifyAdmin, async (req, res) => {
            const order = (await orderCollection.find().toArray()).reverse();
            res.send(order)
        })

        app.get('/review', async (req, res) => {
            const review = (await reviewCollection.find().toArray()).reverse();
            res.send(review)
        })

        app.get('/user', verifyJWT, verifyAdmin, async (req, res) => {
            const user = await userCollection.find().toArray()
            res.send(user)
        })
        app.get('/user/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const user = await userCollection.findOne(filter)
            res.send(user)
        })
        app.get('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params;
            const user = await userCollection.findOne(email);
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })
        app.get('/profile', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const filter = { email }
            // console.log(filter);
            const user = await userCollection.findOne(filter)
            res.send(user)
        })


        // post
        app.post('/order', verifyJWT, async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result)
        })
        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result)
        })
        app.post('/part', verifyJWT, async (req, res) => {
            const part = req.body;
            const result = await partCollection.insertOne(part);
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
                    transitionId: paymentInfo.transitionId
                }
            }
            const result = await orderCollection.updateOne(filter, updateDoc);
            const payment = await paymentCollection.insertOne(paymentInfo);
            sendPaymentConfirmationEmail(paymentInfo);
            res.send({ result, payment })
        })

        app.patch('/all-order/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const shipmentInfo = req.body;
            // console.log(shipmentInfo);
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    paid: true,
                    shipped: shipmentInfo.shipped
                }
            }
            const result = await orderCollection.updateOne(filter, updateDoc);
            sendShipmentInfoEmail(shipmentInfo);
            res.send(result)
        })

        app.patch('/profile/:email', verifyJWT, async (req, res) => {
            const filter = req.params;
            const profile = req.body;
            const updateDoc = { $set: profile };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        app.patch('/user/admin/:email', verifyJWT, async (req, res) => {
            const filter = req.params;
            const updateDoc = {
                $set: { role: 'admin' }
            };
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

        app.delete('/part/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await partCollection.deleteOne(query);
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