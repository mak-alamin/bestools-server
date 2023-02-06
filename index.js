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

  if ( !token ) {
    return res.status(401).send({ message: "Token Not Found" });
  }
  
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    console.log(err);
    if (err) {
      return res.status(403).send({
         message: "Forbidden access",
         error: err
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

    // get all products
    app.get("/product", async (req, res) => {
      const products = await productCollection.find().toArray();
      res.send(products);
    });

    //Insert Product
    app.post("/product", verifyJWT, async (req, res) => {
      const slug = req.body.slug;

      console.log(req.body);
      
      let product = req.body;

      const slugExists = await productCollection.findOne({slug:slug});

      if (slugExists){
        product.slug += '-2';
      }

      let result = await productCollection.insertOne(product);

      res.send(result);
    });

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
      console.log(user);

      if(user){
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

      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
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

      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
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
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello From Bestools server!");
});

app.listen(port, () => {
  console.log(`Bestools server listening on  http://localhost:${port}`);
});
