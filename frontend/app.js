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
    setupEventListeners();
});

// ============================================
// Helper: hash password with username as salt
// ============================================
function hashPassword(username, password) {
    return ethers.keccak256(ethers.toUtf8Bytes(username.toLowerCase() + ":" + password));
}

// ============================================
// Login
// ============================================
async function loginUser() {
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");

    if (!username || !password) {
        showResult(errorEl, "Please enter username and password!", false);
        return;
    }

    try {
        showLoading("Authenticating...");
        // Connect to Hardhat node
        provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

        // Use a read-only contract first to verify login
        const readOnlySigner = await provider.getSigner(CONTRACT_CONFIG.accounts[0].address);
        const readOnlyContract = new ethers.Contract(CONTRACT_CONFIG.contractAddress, CONTRACT_CONFIG.abi, readOnlySigner);

        const passwordHash = hashPassword(username, password);
        const [success, userAddress] = await readOnlyContract.verifyLogin(username, passwordHash);

        if (!success) {
            showResult(errorEl, "Invalid username or password!", false);
            return;
        }

        // Login successful — get signer for this address
        signer = await getSignerForAddress(userAddress);
        contract = new ethers.Contract(CONTRACT_CONFIG.contractAddress, CONTRACT_CONFIG.abi, signer);

        const user = await contract.getUser(userAddress);
        currentUser = {
            address: userAddress,
            name: user.name,
            role: Number(user.role),
            active: user.active,
        };

        // Update UI
        errorEl.style.display = "none";
        document.getElementById("user-name").textContent = currentUser.name;
        const roleEl = document.getElementById("user-role");
        roleEl.textContent = ROLE_NAMES[currentUser.role];
        roleEl.className = `badge ${ROLE_CLASSES[currentUser.role]}`;
        document.getElementById("user-info").classList.remove("hidden");

        // Hide login section, show app
        document.getElementById("connection-section").classList.add("hidden");

        document.getElementById("main-nav").classList.remove("hidden");
        document.getElementById("panels").classList.remove("hidden");

        // Logs only for admin
        if (currentUser.role === 1) {
            document.getElementById("tx-log-section").classList.remove("hidden");
            loadAllLogs();
        }

        adjustNavForRole(currentUser.role);
        switchPanel("dashboard", document.querySelector('[data-panel="dashboard"]'));
        await loadDashboard();

        logTx(`Logged in: ${currentUser.name} (${ROLE_NAMES[currentUser.role]})`);
        hideLoading();
    } catch (err) {
        hideLoading();
        showResult(errorEl, "Connection error: " + (err.message || err), false);
        console.error(err);
    }
}

function logoutUser() {
    // Reset state
    provider = null;
    signer = null;
    contract = null;
    currentUser = null;

    // Show login, hide app
    document.getElementById("connection-section").classList.remove("hidden");
    document.getElementById("login-username").value = "";
    document.getElementById("login-password").value = "";
    document.getElementById("login-error").style.display = "none";
    document.getElementById("user-info").classList.add("hidden");

    document.getElementById("main-nav").classList.add("hidden");
    document.getElementById("panels").classList.add("hidden");
    document.getElementById("tx-log-section").classList.add("hidden");
    document.getElementById("tx-log").innerHTML = "";

    // Clear all panel content from previous session
    document.querySelectorAll("#all-batches-table tbody, #all-users-table tbody, #batch-detail-table tbody").forEach(el => el.innerHTML = "");
    document.getElementById("batch-timeline").innerHTML = "";
    document.getElementById("batch-detail").classList.add("hidden");
    document.getElementById("search-result").style.display = "none";
    document.getElementById("search-batch-id").value = "";
    document.querySelectorAll(".result").forEach(el => { el.style.display = "none"; el.textContent = ""; });
    document.querySelectorAll("#panels input, #panels select").forEach(el => {
        if (el.type === "text" || el.type === "number" || el.type === "password") el.value = "";
    });
}

function setupEventListeners() {
    // Login
    document.getElementById("connect-btn").addEventListener("click", loginUser);
    document.getElementById("login-password").addEventListener("keydown", (e) => {
        if (e.key === "Enter") loginUser();
    });

    // Logout
    document.getElementById("logout-btn").addEventListener("click", logoutUser);

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

function adjustNavForRole(role) {
    // Hide all nav buttons first, then show only relevant ones
    const panel = (name) => document.querySelector(`[data-panel="${name}"]`);
    const allPanels = ["dashboard", "register-user", "create-batch", "update-batch",
                       "transfer-batch", "certify-batch", "search-batch", "all-batches", "all-users"];
    allPanels.forEach(p => { if (panel(p)) panel(p).classList.add("hidden"); });

    // Always visible
    panel("dashboard").classList.remove("hidden");
    panel("search-batch").classList.remove("hidden");

    // Roles: 1=Admin, 2=Producer, 3=Transporter, 4=Warehouse, 5=Distributor, 6=Regulator
    if (role === 1) {
        // Admin: manage users + view all batches
        panel("register-user").classList.remove("hidden");
        panel("all-users").classList.remove("hidden");
        panel("all-batches").classList.remove("hidden");
    } else if (role === 2) {
        // Producer
        panel("create-batch").classList.remove("hidden");
        panel("update-batch").classList.remove("hidden");
        panel("transfer-batch").classList.remove("hidden");
        panel("all-batches").classList.remove("hidden");
    } else if (role >= 3 && role <= 5) {
        // Transporter, Warehouse, Distributor
        panel("update-batch").classList.remove("hidden");
        panel("transfer-batch").classList.remove("hidden");
        panel("all-batches").classList.remove("hidden");
    } else if (role === 6) {
        // Regulator: full read access + certify
        panel("certify-batch").classList.remove("hidden");
        panel("all-batches").classList.remove("hidden");
        panel("all-users").classList.remove("hidden");
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
        showLoading("Loading dashboard...");
        const batchCount = await contract.batchCount();
        const isFullAccess = currentUser.role === 1 || currentUser.role === 6;

        if (isFullAccess) {
            // Admin & Regulator see global stats
            document.getElementById("stat-users-box").style.display = "";
            const userCount = await contract.getUserCount();
            document.getElementById("stat-batches").textContent = Number(batchCount);
            document.getElementById("stat-users").textContent = Number(userCount);

            let certifiedCount = 0;
            for (let i = 1; i <= Number(batchCount); i++) {
                const batch = await contract.getBatch(i);
                if (batch.certified) certifiedCount++;
            }
            document.getElementById("stat-certified").textContent = certifiedCount;
        } else {
            // Other roles: hide users stat, show only their batch stats
            document.getElementById("stat-users-box").style.display = "none";
            let myBatches = 0;
            let myCertified = 0;
            for (let i = 1; i <= Number(batchCount); i++) {
                const b = await contract.getBatch(i);
                let involved = b.producer.toLowerCase() === currentUser.address.toLowerCase() ||
                               b.currentHolder.toLowerCase() === currentUser.address.toLowerCase();
                if (!involved) {
                    const history = await contract.getBatchHistory(i);
                    for (const cp of history) {
                        if (cp.handler.toLowerCase() === currentUser.address.toLowerCase()) {
                            involved = true;
                            break;
                        }
                    }
                }
                if (involved) {
                    myBatches++;
                    if (b.certified) myCertified++;
                }
            }
            document.getElementById("stat-batches").textContent = myBatches;
            document.getElementById("stat-certified").textContent = myCertified;
        }
        hideLoading();
    } catch (err) {
        hideLoading();
        console.error("Dashboard error:", err);
    }
}

// ============================================
// Signer helper: Hardhat accounts or generated wallets
// ============================================
async function getSignerForAddress(address) {
    const isHardhatAccount = CONTRACT_CONFIG.accounts.some(
        a => a.address.toLowerCase() === address.toLowerCase()
    );
    if (isHardhatAccount) {
        return await provider.getSigner(address);
    }
    // Generated wallet — retrieve private key from localStorage
    const keys = JSON.parse(localStorage.getItem("sct_wallets") || "{}");
    const pk = keys[address.toLowerCase()];
    if (pk) {
        return new ethers.Wallet(pk, provider);
    }
    throw new Error("No signing key found for this address. Was the account created on this browser?");
}

// ============================================
// Register User (Admin)
// ============================================
async function findOrCreateAddress() {
    // 1. Try pre-funded Hardhat accounts first
    for (const acc of CONTRACT_CONFIG.accounts) {
        const user = await contract.getUser(acc.address);
        if (Number(user.role) === 0) {
            return acc.address;
        }
    }
    // 2. All Hardhat accounts taken — generate a new wallet
    const wallet = ethers.Wallet.createRandom();
    // Fund it from admin with 100 ETH (local testnet)
    const fundTx = await signer.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther("100")
    });
    await fundTx.wait();
    // Save private key in localStorage
    const keys = JSON.parse(localStorage.getItem("sct_wallets") || "{}");
    keys[wallet.address.toLowerCase()] = wallet.privateKey;
    localStorage.setItem("sct_wallets", JSON.stringify(keys));
    return wallet.address;
}

async function registerUser() {
    const name = document.getElementById("reg-name").value.trim();
    const password = document.getElementById("reg-password").value;
    const role = document.getElementById("reg-role").value;
    const customAddress = document.getElementById("reg-address").value.trim();
    const resultEl = document.getElementById("register-user-result");

    if (!name || !password) {
        showResult(resultEl, "Username and password are required!", false);
        return;
    }

    if (password.length < 4) {
        showResult(resultEl, "Password must be at least 4 characters!", false);
        return;
    }

    try {
        showLoading("Registering user...");
        // Determine address: custom or auto-create
        let address = customAddress;
        if (!address) {
            address = await findOrCreateAddress();
        }

        // Hash password client-side (username as salt)
        const passwordHash = hashPassword(name, password);

        const tx = await contract.registerUser(address, name, parseInt(role), passwordHash);
        await tx.wait();
        showResult(resultEl, `User "${name}" registered successfully! Address: ${address.slice(0, 10)}...`, true);
        logTx(`User registered: ${name} → ${ROLE_NAMES[role]}`);

        // Clear form
        document.getElementById("reg-name").value = "";
        document.getElementById("reg-password").value = "";
        document.getElementById("reg-address").value = "";
        hideLoading();
    } catch (err) {
        hideLoading();
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
        showLoading("Creating batch...");
        const tx = await contract.createBatch(productType, parseInt(category), origin);
        const receipt = await tx.wait();
        showResult(resultEl, `Batch created successfully! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`New batch: ${productType} (${origin})`);
        hideLoading();
    } catch (err) {
        hideLoading();
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
        showLoading("Updating status...");
        const tx = await contract.updateBatchStatus(parseInt(batchId), parseInt(status), location, notes);
        await tx.wait();
        showResult(resultEl, `Status updated to ${STATUS_NAMES[status]}! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`Batch #${batchId} updated to ${STATUS_NAMES[status]}`);
        hideLoading();
    } catch (err) {
        hideLoading();
        showResult(resultEl, `Error: ${parseError(err)}`, false);
    }
}

// ============================================
// Transfer Batch
// ============================================
async function transferBatch() {
    const batchId = document.getElementById("transfer-batch-id").value;
    const newHolderInput = document.getElementById("transfer-new-holder").value.trim();
    const resultEl = document.getElementById("transfer-batch-result");

    if (!batchId || !newHolderInput) {
        showResult(resultEl, "Please fill in ID and new holder!", false);
        return;
    }

    try {
        showLoading("Transferring batch...");
        let newHolderAddress;
        let displayName = newHolderInput;

        if (newHolderInput.startsWith("0x") && newHolderInput.length === 42) {
            // Input is an address
            newHolderAddress = newHolderInput;
        } else {
            // Input is a username — resolve to address
            newHolderAddress = await contract.getAddressByUsername(newHolderInput);
            if (newHolderAddress === ethers.ZeroAddress) {
                hideLoading();
                showResult(resultEl, `User "${newHolderInput}" not found!`, false);
                return;
            }
        }

        const tx = await contract.transferBatch(parseInt(batchId), newHolderAddress);
        await tx.wait();
        showResult(resultEl, `Transfer successful to "${displayName}"! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`Batch #${batchId} transferred to ${displayName}`);
        hideLoading();
    } catch (err) {
        hideLoading();
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
        showLoading("Certifying batch...");
        const tx = await contract.certifyBatch(parseInt(batchId));
        await tx.wait();
        showResult(resultEl, `Batch #${batchId} certified! TX: ${tx.hash.slice(0, 20)}...`, true);
        logTx(`Batch #${batchId} certified`);
        hideLoading();
    } catch (err) {
        hideLoading();
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
        showLoading("Searching...");
        const batch = await contract.getBatch(parseInt(batchId));
        const history = await contract.getBatchHistory(parseInt(batchId));

        // Access check: regulator & admin see all, others only their batches
        if (currentUser.role !== 1 && currentUser.role !== 6) {
            let involved = batch.producer.toLowerCase() === currentUser.address.toLowerCase() ||
                           batch.currentHolder.toLowerCase() === currentUser.address.toLowerCase();
            if (!involved) {
                for (const cp of history) {
                    if (cp.handler.toLowerCase() === currentUser.address.toLowerCase()) {
                        involved = true;
                        break;
                    }
                }
            }
            if (!involved) {
                hideLoading();
                showResult(resultEl, "Access denied: you are not involved in this batch.", false);
                detailEl.classList.add("hidden");
                return;
            }
        }

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
            <tr><td><strong>Certification</strong></td><td>${batch.certified ? '<i class="fa-solid fa-circle-check" style="color:green"></i> Certified' : '<i class="fa-solid fa-circle-xmark" style="color:red"></i> Not certified'}</td></tr>
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
        hideLoading();
    } catch (err) {
        hideLoading();
        showResult(resultEl, `Error: ${parseError(err)}`, false);
        detailEl.classList.add("hidden");
    }
}

// ============================================
// Load All Batches
// ============================================
async function loadAllBatches() {
    try {
        showLoading("Loading batches...");
        const batchCount = await contract.batchCount();
        const tbody = document.querySelector("#all-batches-table tbody");
        tbody.innerHTML = "";
        const isFullAccess = currentUser.role === 1 || currentUser.role === 6;

        for (let i = 1; i <= Number(batchCount); i++) {
            const b = await contract.getBatch(i);

            // Filter: admin & regulator see all, others only batches they're involved in
            if (!isFullAccess) {
                let involved = false;
                // Check if producer or current holder
                if (b.producer.toLowerCase() === currentUser.address.toLowerCase() ||
                    b.currentHolder.toLowerCase() === currentUser.address.toLowerCase()) {
                    involved = true;
                }
                // Check batch history for past involvement
                if (!involved) {
                    const history = await contract.getBatchHistory(i);
                    for (const cp of history) {
                        if (cp.handler.toLowerCase() === currentUser.address.toLowerCase()) {
                            involved = true;
                            break;
                        }
                    }
                }
                if (!involved) continue;
            }

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
                <td>${b.certified ? '<i class="fa-solid fa-circle-check" style="color:green"></i>' : '<i class="fa-solid fa-circle-xmark" style="color:red"></i>'}</td>
            `;
            tr.style.cursor = "pointer";
            tr.addEventListener("click", () => {
                document.getElementById("search-batch-id").value = Number(b.id);
                switchPanel("search-batch", document.querySelector('[data-panel="search-batch"]'));
                searchBatch();
            });
            tbody.appendChild(tr);
        }
        hideLoading();
    } catch (err) {
        hideLoading();
        console.error("Load batches error:", err);
    }
}

// ============================================
// Load All Users
// ============================================
async function loadAllUsers() {
    try {
        showLoading("Loading users...");
        const addresses = await contract.getAllUserAddresses();
        const tbody = document.querySelector("#all-users-table tbody");
        tbody.innerHTML = "";

        for (const addr of addresses) {
            const u = await contract.getUser(addr);
            const isAdmin = currentUser.role === 1;
            const isSelf = addr.toLowerCase() === currentUser.address.toLowerCase();
            let actionBtn = '';
            if (isAdmin && !isSelf) {
                if (u.active) {
                    actionBtn = `<button class="btn btn-danger btn-sm" onclick="deactivateUser('${addr}')"><i class="fa-solid fa-user-slash"></i> Deactivate</button>`;
                } else {
                    actionBtn = `<button class="btn btn-success btn-sm" onclick="reactivateUser('${addr}')"><i class="fa-solid fa-user-check"></i> Activate</button>`;
                }
            }
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="address">${addr}</td>
                <td>${u.name}</td>
                <td><span class="badge ${ROLE_CLASSES[Number(u.role)]}">${ROLE_NAMES[Number(u.role)]}</span></td>
                <td>${u.active ? '<i class="fa-solid fa-circle-check" style="color:green"></i> Active' : '<i class="fa-solid fa-circle-xmark" style="color:red"></i> Inactive'}</td>
                <td>${actionBtn}</td>
            `;
            tbody.appendChild(tr);
        }
        hideLoading();
    } catch (err) {
        hideLoading();
        console.error("Load users error:", err);
    }
}

// ============================================
// Deactivate User (Admin)
// ============================================
async function deactivateUser(address) {
    if (!confirm(`Are you sure you want to deactivate user ${address.slice(0, 10)}...?`)) return;

    try {
        showLoading("Deactivating user...");
        const tx = await contract.deactivateUser(address);
        await tx.wait();
        logTx(`User deactivated: ${address.slice(0, 10)}...`);
        hideLoading();
        loadAllUsers();
    } catch (err) {
        hideLoading();
        alert(`Error: ${parseError(err)}`);
    }
}

// ============================================
// Reactivate User (Admin)
// ============================================
async function reactivateUser(address) {
    if (!confirm(`Are you sure you want to reactivate user ${address.slice(0, 10)}...?`)) return;

    try {
        showLoading("Reactivating user...");
        const tx = await contract.reactivateUser(address);
        await tx.wait();
        logTx(`User reactivated: ${address.slice(0, 10)}...`);
        hideLoading();
        loadAllUsers();
    } catch (err) {
        hideLoading();
        alert(`Error: ${parseError(err)}`);
    }
}

// Expose to global scope for inline onclick handlers
window.deactivateUser = deactivateUser;
window.reactivateUser = reactivateUser;

// ============================================
// Helpers
// ============================================
function showLoading(msg = "Processing...") {
    document.getElementById("loading-text").textContent = msg;
    document.getElementById("loading-overlay").classList.remove("hidden");
}

function hideLoading() {
    document.getElementById("loading-overlay").classList.add("hidden");
}

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
    // Always persist to localStorage (all users, all actions)
    const logs = JSON.parse(localStorage.getItem("sct_logs") || "[]");
    const entry = { time: new Date().toISOString(), user: currentUser?.name || "system", msg };
    logs.unshift(entry);
    // Keep max 500 entries
    if (logs.length > 500) logs.length = 500;
    localStorage.setItem("sct_logs", JSON.stringify(logs));

    // Only render in UI if admin is viewing
    if (currentUser && currentUser.role === 1) {
        const logEl = document.getElementById("tx-log");
        const div = document.createElement("div");
        div.className = "tx-entry";
        div.textContent = `[${new Date().toLocaleTimeString("en-US")}] [${entry.user}] ${msg}`;
        logEl.prepend(div);
    }
}

function loadAllLogs() {
    const logEl = document.getElementById("tx-log");
    logEl.innerHTML = "";
    const logs = JSON.parse(localStorage.getItem("sct_logs") || "[]");
    for (const entry of logs) {
        const div = document.createElement("div");
        div.className = "tx-entry";
        const time = new Date(entry.time).toLocaleTimeString("en-US");
        div.textContent = `[${time}] [${entry.user}] ${entry.msg}`;
        logEl.appendChild(div);
    }
}
