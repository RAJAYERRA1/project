const express = require("express");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const { open } = require("sqlite");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = (__dirname, "statesDatabase.db");
app.use(express.json());

let dataBase;

// Define SQLite database
const DB_NAME = "statesDatabase.db";
const db = new sqlite3.Database(DB_NAME);
// Create table if not exists
db.serialize(() => {
  db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            title TEXT,
            price INTEGER,
            category TEXT,
            image TEXT,
            sold BOOLEAN,
            dateOfSale TEXT

        )
    `);
});

// Endpoint to initialize the database with seed data from the third-party API
app.get("/initialize_database", async (req, res) => {
  try {
    // Fetch data from the third-party API
    const response = await axios.get(
      "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
    );
    const data = response.data;

    // Insert data into the database
    const stmt = db.prepare(
      "INSERT INTO products ( title, price, category,image,sold,dateOfSale) VALUES (?, ?, ?, ?, ?, ?)"
    );
    data.forEach(({ title, price, category, image, sold, dateOfSale }) => {
      stmt.run(title, price, category, image, sold, dateOfSale);
    });
    stmt.finalize();

    res.json({ message: "Database initialized successfully." });
  } catch (error) {
    console.error("Error initializing database:", error);
    res
      .status(500)
      .json({ error: "An error occurred while initializing the database." });
  }
});

const startServer = async () => {
  try {
    dataBase = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server started");
    });
  } catch (error) {
    console.log(`DB Error : ${error.message}`);
    process.exit(1);
  }
};

startServer();

app.get("/transactions", async (request, response) => {
  const { month, search = "", page = 1, perPage = 10 } = request.query;
  // console.log(month);
  const getTasksQuery = ` 
    SELECT
      * 
    FROM
      products`;
  productTransactions = await dataBase.all(getTasksQuery);
  // console.log(productTransactions);
  // Filter transactions based on the selected month
  let filteredTransactions = productTransactions;
  if (month) {
    //   console.log(month) ;
    filteredTransactions = filteredTransactions.filter((transaction) => {
      const transactionMonth = new Date(transaction.dateOfSale).getMonth() + 1;
      return transactionMonth === parseInt(month);
    });
  }

  // Filter transactions based on the search text
  if (search) {
    const searchText = search.toLowerCase();
    filteredTransactions = filteredTransactions.filter(
      (transaction) =>
        transaction.title.toLowerCase().includes(searchText) ||
        transaction.category.toLowerCase().includes(searchText) ||
        transaction.price.toString().includes(searchText)
    );
  }

  // Calculate pagination
  const startIdx = (page - 1) * perPage;
  const endIdx = startIdx + perPage;
  const paginatedTransactions = filteredTransactions.slice(startIdx, endIdx);
  // console.log(filteredTransactions);
  const totalSaleAmount = filteredTransactions.reduce(
    (acc, transaction) => acc + transaction.price,
    0
  );
  const totalSoldItems = filteredTransactions.filter(
    (transaction) => transaction.sold
  ).length;
  const totalUnsoldItems = filteredTransactions.length - totalSoldItems;

  const priceRanges = [
    { range: "0 - 100", min: 0, max: 100 },
    { range: "101 - 200", min: 101, max: 200 },
    { range: "201 - 300", min: 201, max: 300 },
    { range: "301 - 400", min: 301, max: 400 },
    { range: "401 - 500", min: 401, max: 500 },
    { range: "501 - 600", min: 501, max: 600 },
    { range: "601 - 700", min: 601, max: 700 },
    { range: "701 - 800", min: 701, max: 800 },
    { range: "801 - 900", min: 801, max: 900 },
    { range: "901 - above", min: 901, max: Infinity },
  ];

  // Initialize count for each price range
  const rangeCounts = priceRanges.map((range) => ({
    range: range.range,
    count: 0,
  }));

  // Count the number of items in each price range
  filteredTransactions.forEach((transaction) => {
    const { price } = transaction;
    for (const range of priceRanges) {
      if (price >= range.min && price <= range.max) {
        rangeCounts.find((item) => item.range === range.range).count++;
        break;
      }
    }
  });

  // Send response
  response.send([
    {
      page: parseInt(page),
      perPage: parseInt(perPage),
      totalTransactions: filteredTransactions.length,
      data: paginatedTransactions,
    },
    {
      statistics: [
        {
          totalSaleAmount: totalSaleAmount,
          totalSoldItems: totalSoldItems,
          totalUnsoldItems: totalUnsoldItems,
        },
      ],
    },
    { rangeCounts: rangeCounts },
  ]);
});

module.exports = app;
