/**
 * Supply Chain Tracker - Frontend Application
 * Connection to Hardhat local node via ethers.js
 */
import { CONTRACT_CONFIG } from "./contract-config.js";

// ============================================
// Globals
// ============================================
const ROLE_NAMES = ["None", "Admin", "Producer", "Transporter", "Warehouse", "Distributor", "Regulator"];
const STATUS_NAMES = ["Produced", "Stored", "In Transit", "Delivered"];
const CATEGORY_NAMES = ["Perishable", "Non-Perishable"];
const ROLE_CLASSES = ["", "badge-admin", "badge-producer", "badge-transporter", "badge-warehouse", "badge-distributor", "badge-regulator"];

let provider, signer, contract;
let currentUser = null;

// ============================================
// Initialization
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    setupAccountSelector();
    setupEventListeners();
});

function setupAccountSelector() {
    const select = document.getElementById("account-select");
    CONTRACT_CONFIG.accounts.forEach((acc) => {
        const opt = document.createElement("option");
        opt.value = acc.address;
        opt.textContent = `Account #${acc.index} — ${acc.address.slice(0, 10)}...${acc.address.slice(-6)}`;
        select.appendChild(opt);
    });
}

function setupEventListeners() {
    // Connect
    document.getElementById("connect-btn").addEventListener("click", connectAccount);

    // Nav buttons
    document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => switchPanel(btn.dataset.panel, btn));
    });

    // Actions
    document.getElementById("register-user-btn").addEventListener("click", registerUser);
    document.getElementById("create-batch-btn").addEventListener("click", createBatch);
    document.getElementById("update-batch-btn").addEventListener("click", updateBatchStatus);
    document.getElementById("transfer-batch-btn").addEventListener("click", transferBatch);
    document.getElementById("certify-batch-btn").addEventListener("click", certifyBatch);
    document.getElementById("search-batch-btn").addEventListener("click", searchBatch);
}

// ============================================
// Connection
// ============================================
async function connectAccount() {
    const address = document.getElementById("account-select").value;
    if (!address) {
        alert("Select an account!");
        return;
    }

    try {
        // Connect to Hardhat local node
        provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        signer = await provider.getSigner(address);
        contract = new ethers.Contract(CONTRACT_CONFIG.contractAddress, CONTRACT_CONFIG.abi, signer);

        // Get user info
        const user = await contract.getUser(address);
        currentUser = {
            address: address,
            name: user.name,
            role: Number(user.role),
            active: user.active,
        };

        // Update UI
        document.getElementById("user-name").textContent = currentUser.name || "Not registered";
        const roleEl = document.getElementById("user-role");
        roleEl.textContent = ROLE_NAMES[currentUser.role];
        roleEl.className = `badge ${ROLE_CLASSES[currentUser.role]}`;
        document.getElementById("user-address").textContent = address;
        document.getElementById("user-info").classList.remove("hidden");

        // Show nav & panels
        document.getElementById("main-nav").classList.remove("hidden");
        document.getElementById("panels").classList.remove("hidden");
        document.getElementById("tx-log-section").classList.remove("hidden");

        // Adjust visible nav based on role
        adjustNavForRole(currentUser.role);

        // Load dashboard
        switchPanel("dashboard", document.querySelector('[data-panel="dashboard"]'));
        await loadDashboard();

        logTx(`Connected: ${currentUser.name} (${ROLE_NAMES[currentUser.role]})`);
    } catch (err) {
        alert("Connection error: " + err.message);
        console.error(err);
    }
}

function adjustNavForRole(role) {
    const navBtns = document.querySelectorAll(".nav-btn");
    navBtns.forEach((btn) => {
        btn.classList.remove("hidden");
    });

    // Roles: 1=Admin, 2=Producer, 3=Transporter, 4=Warehouse, 5=Distributor, 6=Regulator
    const panel = (name) => document.querySelector(`[data-panel="${name}"]`);

    // Admin-only: user registration
    if (role !== 1) panel("register-user").classList.add("hidden");

    // Producer-only: batch creation
    if (role !== 2) panel("create-batch").classList.add("hidden");

    // Regulator-only: certification
    if (role !== 6) panel("certify-batch").classList.add("hidden");

    // Regulator sees all, others see limited update/transfer
    if (role === 6) {
        panel("update-batch").classList.add("hidden");
        panel("transfer-batch").classList.add("hidden");
    }
}

// ============================================
// Navigation
// ============================================
function switchPanel(panelName, btn) {
    // Hide all panels
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
    // Show target
    document.getElementById(`panel-${panelName}`).classList.remove("hidden");
    // Active btn
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    // Lazy-load data
    if (panelName === "all-batches") loadAllBatches();
    if (panelName === "all-users") loadAllUsers();
    if (panelName === "dashboard") loadDashboard();
}

// ============================================
// Dashboard
// ============================================
async function loadDashboard() {
    try {
        const batchCount = await contract.batchCount();
        const userCount = await contract.getUserCount();

        document.getElementById("stat-batches").textContent = Number(batchCount);
        document.getElementById("stat-users").textContent = Number(userCount);

        // Count certified
        let certifiedCount = 0;
        for (let i = 1; i <= Number(batchCount); i++) {
            const batch = await contract.getBatch(i);
            if (batch.certified) certifiedCount++;
        }
        document.getElementById("stat-certified").textContent = certifiedCount;
    } catch (err) {
        console.error("Dashboard error:", err);
    }
}

// ============================================
// Register User (Admin)
// ============================================
async function registerUser() {
    const address = document.getElementById("reg-address").value.trim();
    const name = document.getElementById("reg-name").value.trim();
    const role = document.getElementById("reg-role").value;
    const resultEl = document.getElementById("register-user-result");

    if (!address || !name) {
        showResult(resultEl, "Please fill in all fields!", false);
        return;
    }

    try {
        const tx = await contract.registerUser(address, name, parseInt(role));
        await tx.wait();
        showResult(resultEl, `User ${name} registered successfully! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`User registered: ${name} → ${ROLE_NAMES[role]}`);
    } catch (err) {
        showResult(resultEl, `Error: ${parseError(err)}`, false);
    }
}

// ============================================
// Create Batch (Producer)
// ============================================
async function createBatch() {
    const productType = document.getElementById("batch-type").value.trim();
    const category = document.getElementById("batch-category").value;
    const origin = document.getElementById("batch-origin").value.trim();
    const resultEl = document.getElementById("create-batch-result");

    if (!productType || !origin) {
        showResult(resultEl, "Please fill in all fields!", false);
        return;
    }

    try {
        const tx = await contract.createBatch(productType, parseInt(category), origin);
        const receipt = await tx.wait();
        showResult(resultEl, `Batch created successfully! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`New batch: ${productType} (${origin})`);
    } catch (err) {
        showResult(resultEl, `Error: ${parseError(err)}`, false);
    }
}

// ============================================
// Update Batch Status
// ============================================
async function updateBatchStatus() {
    const batchId = document.getElementById("update-batch-id").value;
    const status = document.getElementById("update-status").value;
    const location = document.getElementById("update-location").value.trim();
    const notes = document.getElementById("update-notes").value.trim();
    const resultEl = document.getElementById("update-batch-result");

    if (!batchId || !location) {
        showResult(resultEl, "Please fill in ID and location!", false);
        return;
    }

    try {
        const tx = await contract.updateBatchStatus(parseInt(batchId), parseInt(status), location, notes);
        await tx.wait();
        showResult(resultEl, `Status updated to ${STATUS_NAMES[status]}! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`Batch #${batchId} updated to ${STATUS_NAMES[status]}`);
    } catch (err) {
        showResult(resultEl, `Error: ${parseError(err)}`, false);
    }
}

// ============================================
// Transfer Batch
// ============================================
async function transferBatch() {
    const batchId = document.getElementById("transfer-batch-id").value;
    const newHolder = document.getElementById("transfer-new-holder").value.trim();
    const resultEl = document.getElementById("transfer-batch-result");

    if (!batchId || !newHolder) {
        showResult(resultEl, "Please fill in ID and new holder!", false);
        return;
    }

    try {
        const tx = await contract.transferBatch(parseInt(batchId), newHolder);
        await tx.wait();
        showResult(resultEl, `Transfer successful! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`Batch #${batchId} transferred to ${newHolder.slice(0, 10)}...`);
    } catch (err) {
        showResult(resultEl, `Error: ${parseError(err)}`, false);
    }
}

// ============================================
// Certify Batch (Regulator)
// ============================================
async function certifyBatch() {
    const batchId = document.getElementById("certify-batch-id").value;
    const resultEl = document.getElementById("certify-batch-result");

    if (!batchId) {
        showResult(resultEl, "Please fill in batch ID!", false);
        return;
    }

    try {
        const tx = await contract.certifyBatch(parseInt(batchId));
        await tx.wait();
        showResult(resultEl, `Batch #${batchId} certified! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`Batch #${batchId} certified`);
    } catch (err) {
        showResult(resultEl, `Error: ${parseError(err)}`, false);
    }
}

// ============================================
// Search Batch
// ============================================
async function searchBatch() {
    const batchId = document.getElementById("search-batch-id").value;
    const resultEl = document.getElementById("search-result");
    const detailEl = document.getElementById("batch-detail");

    if (!batchId) {
        showResult(resultEl, "Enter batch ID!", false);
        detailEl.classList.add("hidden");
        return;
    }

    try {
        const batch = await contract.getBatch(parseInt(batchId));
        const history = await contract.getBatchHistory(parseInt(batchId));

        // Hide result msg, show detail
        resultEl.style.display = "none";
        detailEl.classList.remove("hidden");

        // Batch details table
        const tbody = document.querySelector("#batch-detail-table tbody");
        const producerUser = await contract.getUser(batch.producer);
        const holderUser = await contract.getUser(batch.currentHolder);

        tbody.innerHTML = `
            <tr><td><strong>ID</strong></td><td>${Number(batch.id)}</td></tr>
            <tr><td><strong>Type</strong></td><td>${batch.productType}</td></tr>
            <tr><td><strong>Category</strong></td><td>${CATEGORY_NAMES[Number(batch.category)]}</td></tr>
            <tr><td><strong>Origin</strong></td><td>${batch.origin}</td></tr>
            <tr><td><strong>Creation Date</strong></td><td>${formatDate(Number(batch.creationDate))}</td></tr>
            <tr><td><strong>Status</strong></td><td><span class="status-${STATUS_NAMES[Number(batch.status)].toLowerCase().replace(' ', '')}">${STATUS_NAMES[Number(batch.status)]}</span></td></tr>
            <tr><td><strong>Producer</strong></td><td>${producerUser.name} (${batch.producer.slice(0, 10)}...)</td></tr>
            <tr><td><strong>Current Holder</strong></td><td>${holderUser.name} (${batch.currentHolder.slice(0, 10)}...)</td></tr>
            <tr><td><strong>Certification</strong></td><td>${batch.certified ? "✅ Certified" : "❌ Not certified"}</td></tr>
        `;

        // Timeline
        const timelineEl = document.getElementById("batch-timeline");
        timelineEl.innerHTML = "";
        for (const cp of history) {
            const handlerUser = await contract.getUser(cp.handler);
            const item = document.createElement("div");
            item.className = "timeline-item";
            item.innerHTML = `
                <div class="timeline-date">${formatDate(Number(cp.timestamp))}</div>
                <div class="timeline-content">
                    <strong>${STATUS_NAMES[Number(cp.status)]} — ${cp.location || "N/A"}</strong>
                    <span>${handlerUser.name} (${ROLE_NAMES[Number(handlerUser.role)]})</span>
                    ${cp.notes ? `<div class="notes">${cp.notes}</div>` : ""}
                </div>
            `;
            timelineEl.appendChild(item);
        }
    } catch (err) {
        showResult(resultEl, `Error: ${parseError(err)}`, false);
        detailEl.classList.add("hidden");
    }
}

// ============================================
// Load All Batches
// ============================================
async function loadAllBatches() {
    try {
        const batchCount = await contract.batchCount();
        const tbody = document.querySelector("#all-batches-table tbody");
        tbody.innerHTML = "";

        for (let i = 1; i <= Number(batchCount); i++) {
            const b = await contract.getBatch(i);
            const holderUser = await contract.getUser(b.currentHolder);
            const statusClass = ["status-produced", "status-stored", "status-intransit", "status-delivered"][Number(b.status)];

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${Number(b.id)}</td>
                <td>${b.productType}</td>
                <td>${CATEGORY_NAMES[Number(b.category)]}</td>
                <td>${b.origin}</td>
                <td><span class="${statusClass}">${STATUS_NAMES[Number(b.status)]}</span></td>
                <td title="${b.currentHolder}">${holderUser.name || b.currentHolder.slice(0, 10) + "..."}</td>
                <td>${b.certified ? "✅" : "❌"}</td>
            `;
            tr.style.cursor = "pointer";
            tr.addEventListener("click", () => {
                document.getElementById("search-batch-id").value = Number(b.id);
                switchPanel("search-batch", document.querySelector('[data-panel="search-batch"]'));
                searchBatch();
            });
            tbody.appendChild(tr);
        }
    } catch (err) {
        console.error("Load batches error:", err);
    }
}

// ============================================
// Load All Users
// ============================================
async function loadAllUsers() {
    try {
        const addresses = await contract.getAllUserAddresses();
        const tbody = document.querySelector("#all-users-table tbody");
        tbody.innerHTML = "";

        for (const addr of addresses) {
            const u = await contract.getUser(addr);
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="address">${addr}</td>
                <td>${u.name}</td>
                <td><span class="badge ${ROLE_CLASSES[Number(u.role)]}">${ROLE_NAMES[Number(u.role)]}</span></td>
                <td>${u.active ? "✅ Active" : "❌ Inactive"}</td>
            `;
            tbody.appendChild(tr);
        }
    } catch (err) {
        console.error("Load users error:", err);
    }
}

// ============================================
// Helpers
// ============================================
function showResult(el, msg, success) {
    el.textContent = msg;
    el.className = `result ${success ? "success" : "error"}`;
    el.style.display = "block";
}

function formatDate(timestamp) {
    if (!timestamp) return "N/A";
    return new Date(timestamp * 1000).toLocaleString("en-US");
}

function parseError(err) {
    // Try to extract revert reason
    const msg = err?.reason || err?.data?.message || err?.message || "Unknown error";
    // Look for revert string
    const match = msg.match(/reverted with reason string '([^']+)'/);
    if (match) return match[1];
    // Look for custom error
    if (msg.includes("Access denied")) return msg;
    return msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
}

function logTx(msg) {
    const logEl = document.getElementById("tx-log");
    const entry = document.createElement("div");
    entry.className = "tx-entry";
    entry.textContent = `[${new Date().toLocaleTimeString("en-US")}] ${msg}`;
    logEl.prepend(entry);
}
