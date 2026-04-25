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
- Register 10 users (1 Admin + 9 with various roles)
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

### Connection
Select an account from the list and click **Connect**. The system automatically recognizes your role.

### Demo Accounts

| Account | Name | Role |
|---------|------|------|
| #0 | Admin | Administrator |
| #1 | Papadopoulos Farm | Producer |
| #2 | Hellas Transport | Transporter |
| #3 | Piraeus Warehouse | Warehouse |
| #4 | Athens SuperMarket | Distributor |
| #5 | EFET - Regulatory Authority | Regulator |
| #6 | Thessaly Farm | Producer |
| #7 | North Express Shipping | Transporter |
| #8 | THES Distribution Center | Warehouse |
| #9 | Health Pharmacy | Distributor |

### Permissions per Role

| Role | Permissions |
|------|------------|
| Administrator | Register/deactivate users |
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

- **Solidity ^0.8.27** — Smart Contract
- **Hardhat** — Development & testing framework
- **ethers.js v6** — Frontend ↔ blockchain connection
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
