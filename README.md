# Supply Chain Tracker — Supply Chain Product Traceability System

A supply chain product traceability system based on **Blockchain** technology and **Smart Contracts**.

## Prerequisites

- **Node.js** v18+ → [https://nodejs.org/](https://nodejs.org/)
- **npm** (installed with Node.js)

## Installation & Execution Guide

### 1. Install dependencies

```bash
npm install
```

### 2. Start local Blockchain (Hardhat Node)

Open a terminal and run:

```bash
npx hardhat node
```

> This starts a local Ethereum blockchain at `http://127.0.0.1:8545` with 20 test accounts (10000 ETH each).

**Leave this terminal open.**

### 3. Deploy Smart Contract & Demo Data

Open a **second terminal** and run:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

This will:
- Deploy the SupplyChain smart contract
- Register 10 users (1 Admin + 9 with various roles) with hashed passwords
- Create 10 product batches
- Execute 2 full end-to-end routes (Olive Oil & Vaccine)
- Automatically generate the `frontend/contract-config.js` file

### 4. Start UI

Open the `frontend/index.html` file in the browser.

> **Note:** Due to JavaScript modules, you need to run a local HTTP server:

```bash
npx http-server frontend -p 3000 -c-1
```

Then open: **http://localhost:3000**

## Using the Application

### Login
Enter your **username** and **password**, then click **Login**. The system authenticates via on-chain password hash verification and automatically recognizes your role.

To logout, click the **Logout** button on the navigation bar.

### Demo Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Administrator |
| producer1 | producer1 | Producer |
| transporter1 | transporter1 | Transporter |
| warehouse1 | warehouse1 | Warehouse |
| distributor1 | distributor1 | Distributor |
| regulator1 | regulator1 | Regulator |
| producer2 | producer2 | Producer |
| transporter2 | transporter2 | Transporter |
| warehouse2 | warehouse2 | Warehouse |
| distributor2 | distributor2 | Distributor |

### Permissions per Role

| Role | Permissions |
|------|------------|
| Administrator | Register users (with auto-generated Ethereum address & hashed password) |
| Producer | Create batches, transfer |
| Transporter | Update status (transport), transfer |
| Warehouse | Update status (storage), transfer |
| Distributor | Update status (delivery), transfer |
| Regulator | Certify batches, full read access |

## Project Structure

```
supply-chain-blockchain/
├── contracts/
│   └── SupplyChain.sol          # Smart Contract (Solidity)
├── scripts/
│   └── deploy.js                # Deploy script & demo data
├── frontend/
│   ├── index.html               # UI - main page
│   ├── style.css                # Styles
│   ├── app.js                   # Frontend logic (ethers.js)
│   └── contract-config.js       # ABI & address (auto-generated)
├── hardhat.config.js            # Hardhat configuration
├── package.json
└── README.md
```

## Technologies

- **Solidity ^0.8.27** — Smart Contract (with on-chain password hash authentication)
- **Hardhat** — Development & testing framework
- **ethers.js v6** — Frontend ↔ blockchain connection
- **Font Awesome 6** — UI icons
- **HTML/CSS/JavaScript** — User Interface

## Security Audit

To audit the smart contract:

```bash
# Solhint (lint)
npm install -g solhint
solhint contracts/SupplyChain.sol

# Slither (static analysis)
pip install slither-analyzer
slither .
```
