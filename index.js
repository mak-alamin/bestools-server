const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 8000;

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Token Not Found" });
  }

  jwt.verify(token, process.env.JWT_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({
        message: "Forbidden access",
        error: err,
      });
    }
    req.decoded = decoded;
    next();
  });
}

function validateId(req, res, next) {
  const id = req.params?.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  next();
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kdfnv.mongodb.net/?retryWrites=true&w=majority`;

// const uri = "mongodb://127.0.0.1:27017/bestools";

async function run() {
  try {
    const client = await MongoClient.connect(uri);

    const userCollection = client.db("bestools").collection("users");
    const productCollection = client.db("bestools").collection("products");

    const orderCollection = client.db("bestools").collection("orders");

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // Get JWT auth token
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;

      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.JWT_SECRET, {
          expiresIn: "1d",
        });

        // console.log(token);
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    /**
     * -----------------------------------
     * User API routes
     * -----------------------------------
     */
    // get all users
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // get single user (by email)
    app.get("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      const filter = { email: email };

      let user = await userCollection.findOne(filter);

      resUser = {
        ...user,
        _id: user?._id.toString(),
      };

      // console.log(resUser);

      res.send(resUser);
    });

    // Insert One User (for registration)
    app.post("/user/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };

      const userExists = await userCollection.findOne(filter);

      let result = true;

      if (!userExists) {
        const user = req.body;

        result = await userCollection.insertOne(user);
      }

      res.send(result);
    });

    // Update or insert user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);

      res.send(result);
    });

    // Update or insert admin user (for Make Admin)
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    /**
     * -----------------------------------
     * Product API routes
     * -----------------------------------
     */
    // Get all products
    app.get("/product", async (req, res) => {
      const products = await productCollection.find().toArray();
      res.send(products);
    });

    // Get Single Product
    app.get("/product/:id", validateId, async (req, res) => {
      const id = req.params?.id.toString().trim();
      const query = { _id: ObjectId(id) };

      const result = await productCollection.findOne(query);

      res.send(result);
    });

    //Insert Product
    app.post("/product", verifyJWT, verifyAdmin, async (req, res) => {
      const slug = req.body?.slug.trim();

      let product = req.body;

      const slugExists = await productCollection.findOne({ slug: slug });

      if (slugExists) {
        product.slug += "-2";
      }

      let result = await productCollection.insertOne(product);

      res.send(result);
    });

    // Update Product
    app.put(
      "/product/:id",
      verifyJWT,
      verifyAdmin,
      validateId,
      async (req, res) => {
        const id = req.params?.id.toString().trim();
        const product = req.body;
        const filter = { _id: ObjectId(id) };
        const updateDoc = {
          $set: product,
        };
        const result = await productCollection.updateOne(filter, updateDoc);

        res.send(result);
      }
    );

    // Delete Product
    app.delete(
      "/product/:id",
      verifyJWT,
      verifyAdmin,
      validateId,
      async (req, res) => {
        const id = req.params?.id.trim();
        // console.log(id);
        const filter = { _id: ObjectId(id) };
        const result = await productCollection.deleteOne(filter);
        res.send(result);
      }
    );

    /**
     * -----------------------------------
     * Orders API routes
     * -----------------------------------
     */
    // Get all orders
    app.get("/orders", verifyJWT, verifyAdmin, async (req, res) => {
      const orders = await orderCollection.find().toArray();
      res.send(orders);
    });

    // Get orders for single user
    app.get("/orders/:email", verifyJWT, async (req, res) => {
      const email = req.params?.email.toString().trim();

      // console.log(email);

      const filter = { userEmail: email };

      const result = await orderCollection.find(filter).toArray();

      res.send(result);
    });

    // Get order by id
    app.get("/order/:id", verifyJWT, validateId, async (req, res) => {
      const id = req.params?.id.toString().trim();

      const filter = { _id: ObjectId(id) };

      const result = await orderCollection.findOne(filter);

      res.send(result);
    });

    //Insert Order
    app.post("/order", verifyJWT, async (req, res) => {
      let order = req.body;

      let result = await orderCollection.insertOne(order);

      res.send(result);
    });

    // Update Order
    app.patch("/order/:id", verifyJWT, validateId, async (req, res) => {
      const id = req.params?.id.toString().trim();

      const idObject = ObjectId.createFromHexString(id);

      const payment = req.body;

      const filter = { _id: idObject };
      const updateDoc = {
        $set: payment,
      };
      const result = await orderCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    // Delete/Cancel Order
    app.delete("/order/:id", verifyJWT, validateId, async (req, res) => {
      const id = req.params?.id.toString().trim();
      // console.log(id);
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(filter);
      res.send(result);
    });

    /**
     * -----------------------------------
     * Payment API routes
     * -----------------------------------
     */
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      // console.log(req.body?.orderId);

      const orderId = req.body?.orderId.toString().trim();

      const order = await orderCollection.findOne({ _id: ObjectId(orderId) });

      if (!order) {
        res.send({
          error: "not-found",
          message: "Order Not found!",
        });
      }

      const price =
        parseFloat(order?.price) * parseFloat(order?.quantity) * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
  } catch (err) {
    console.log(err);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello From Bestools server!");
});

app.listen(port, () => {
  console.log(`Bestools server listening on  http://localhost:${port}`);
});
