const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kdfnv.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

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
    console.log(err);
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

async function run() {
  try {
    await client.connect();
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

      const user = await userCollection.findOne(filter);
      // console.log(user);

      if (user) {
        res.send(user);
      }
    });

    // Insert One User (for first time sign in)
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
    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };

      const result = await productCollection.findOne(query);

      res.send(result);
    });

    //Insert Product
    app.post("/product", verifyJWT, verifyAdmin, async (req, res) => {
      const slug = req.body.slug;

      // console.log(req.body);

      let product = req.body;

      const slugExists = await productCollection.findOne({ slug: slug });

      if (slugExists) {
        product.slug += "-2";
      }

      let result = await productCollection.insertOne(product);

      res.send(result);
    });

    // Update Product
    app.put("/product/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const product = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: product,
      };
      const result = await productCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    // Delete Product
    app.delete("/product/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const filter = { _id: ObjectId(id) };
      const result = await productCollection.deleteOne(filter);
      res.send(result);
    });

    /**
     * -----------------------------------
     * Orders API routes
     * -----------------------------------
     */
    // Get all orders
    app.get("/order", verifyJWT, verifyAdmin, async (req, res) => {
      const orders = await orderCollection.find().toArray();
      res.send(orders);
    });

    // Get orders for single user
    app.get("/order/:email", verifyJWT, async (req, res) => {
      const email = req.params?.email;
      const filter = { userEmail: email };

      const result = await orderCollection.find(filter).toArray();

      console.log(result);

      res.send(result);
    });

    //Insert Order
    app.post("/order", verifyJWT, async (req, res) => {
      let order = req.body;

      let result = await orderCollection.insertOne(order);

      res.send(result);
    });

    // Delete/Cancel Order
    app.delete("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(filter);
      res.send(result);
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
