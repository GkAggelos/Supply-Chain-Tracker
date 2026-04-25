/**
 * Deploy script: Deploys the SupplyChain contract and registers demo users + batches.
 * Usage: npx hardhat run scripts/deploy.js --network localhost
 */
import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const signers = await hre.ethers.getSigners();

  // === Roles (correspond to contract enums) ===
  // 0=None, 1=Admin, 2=Producer, 3=Transporter, 4=Warehouse, 5=Distributor, 6=Regulator
  const ROLES = {
    Admin: 1,
    Producer: 2,
    Transporter: 3,
    Warehouse: 4,
    Distributor: 5,
    Regulator: 6,
  };

  const CATEGORY = { Perishable: 0, NonPerishable: 1 };
  const STATUS = { Produced: 0, Stored: 1, InTransit: 2, Delivered: 3 };

  // === Deploy Contract ===
  console.log("Deploying SupplyChain contract...");
  const SupplyChain = await hre.ethers.getContractFactory("SupplyChain");
  const contract = await SupplyChain.deploy();
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log(`SupplyChain deployed at: ${contractAddress}`);
  console.log(`Admin (deployer): ${signers[0].address}\n`);

  // === Register 6 users (1 per role) ===
  const usersData = [
    { signer: signers[1], name: "Papadopoulos Farm", role: ROLES.Producer },
    { signer: signers[2], name: "Hellas Transport", role: ROLES.Transporter },
    { signer: signers[3], name: "Piraeus Warehouse", role: ROLES.Warehouse },
    { signer: signers[4], name: "Athens SuperMarket", role: ROLES.Distributor },
    { signer: signers[5], name: "EFET - Regulatory Authority", role: ROLES.Regulator },
    { signer: signers[6], name: "Thessaly Farm", role: ROLES.Producer },
    { signer: signers[7], name: "North Express Shipping", role: ROLES.Transporter },
    { signer: signers[8], name: "THES Distribution Center", role: ROLES.Warehouse },
    { signer: signers[9], name: "Health Pharmacy", role: ROLES.Distributor },
  ];

  console.log("=== Registering Users ===");
  for (const u of usersData) {
    const tx = await contract.registerUser(u.signer.address, u.name, u.role);
    await tx.wait();
    const roleNames = ["None", "Admin", "Producer", "Transporter", "Warehouse", "Distributor", "Regulator"];
    console.log(`  ✓ ${u.name} (${roleNames[u.role]}) → ${u.signer.address}`);
  }

  // === Create 10 batches ===
  console.log("\n=== Creating Batches ===");
  const producer1 = contract.connect(signers[1]); // Papadopoulos Farm
  const producer2 = contract.connect(signers[6]); // Thessaly Farm

  const batchesData = [
    { contract: producer1, type: "Extra Virgin Olive Oil", cat: CATEGORY.Perishable, origin: "Kalamata, Messinia" },
    { contract: producer1, type: "Feta PDO", cat: CATEGORY.Perishable, origin: "Thessaly" },
    { contract: producer1, type: "Thyme Honey", cat: CATEGORY.NonPerishable, origin: "Crete" },
    { contract: producer1, type: "Xinomavro Wine", cat: CATEGORY.Perishable, origin: "Naoussa, Imathia" },
    { contract: producer1, type: "Kozani Saffron", cat: CATEGORY.NonPerishable, origin: "Kozani" },
    { contract: producer2, type: "Aspirin 500mg", cat: CATEGORY.NonPerishable, origin: "Athens, Attica" },
    { contract: producer2, type: "COVID-19 Vaccine", cat: CATEGORY.Perishable, origin: "Thessaloniki" },
    { contract: producer2, type: "Car Spare Part A-200", cat: CATEGORY.NonPerishable, origin: "Patras" },
    { contract: producer2, type: "Farmed Sea Bream", cat: CATEGORY.Perishable, origin: "Messolonghi" },
    { contract: producer2, type: "Fresh Organic Milk", cat: CATEGORY.Perishable, origin: "Larissa, Thessaly" },
  ];

  for (let i = 0; i < batchesData.length; i++) {
    const b = batchesData[i];
    const tx = await b.contract.createBatch(b.type, b.cat, b.origin);
    await tx.wait();
    console.log(`  ✓ Batch #${i + 1}: ${b.type} (${b.origin})`);
  }

  // === Full Route #1: Olive Oil (Batch #1) ===
  console.log("\n=== Full Route #1: Olive Oil ===");
  const transporter1 = contract.connect(signers[2]); // Hellas Transport
  const warehouse1 = contract.connect(signers[3]);    // Piraeus Warehouse
  const distributor1 = contract.connect(signers[4]);   // Athens SuperMarket
  const regulator = contract.connect(signers[5]);      // EFET

  // Step 1: Producer → Transporter
  let tx = await producer1.transferBatch(1, signers[2].address);
  await tx.wait();
  console.log("  1. Transfer to Transporter");

  // Step 2: Transporter updates status → InTransit
  tx = await transporter1.updateBatchStatus(1, STATUS.InTransit, "Kalamata-Athens Highway", "Refrigerated transport, 8°C");
  await tx.wait();
  console.log("  2. Status → InTransit");

  // Step 3: Transporter → Warehouse
  tx = await transporter1.transferBatch(1, signers[3].address);
  await tx.wait();
  console.log("  3. Transfer to Warehouse");

  // Step 4: Warehouse updates → Stored
  tx = await warehouse1.updateBatchStatus(1, STATUS.Stored, "Piraeus Warehouse, Attica", "Stored in controlled environment");
  await tx.wait();
  console.log("  4. Status → Stored");

  // Step 5: Warehouse → Transporter (second transport)
  tx = await warehouse1.transferBatch(1, signers[2].address);
  await tx.wait();
  console.log("  5. Transfer back to Transporter");

  // Step 6: Transporter → InTransit
  tx = await transporter1.updateBatchStatus(1, STATUS.InTransit, "Piraeus → Athens center", "Final transport to point of sale");
  await tx.wait();
  console.log("  6. Status → InTransit");

  // Step 7: Transporter → Distributor
  tx = await transporter1.transferBatch(1, signers[4].address);
  await tx.wait();
  console.log("  7. Transfer to Distributor/Retailer");

  // Step 8: Distributor updates → Delivered
  tx = await distributor1.updateBatchStatus(1, STATUS.Delivered, "Athens SuperMarket, Syntagma", "Received and placed on shelf");
  await tx.wait();
  console.log("  8. Status → Delivered");

  // Step 9: Certification by EFET
  tx = await regulator.certifyBatch(1);
  await tx.wait();
  console.log("  9. Certified by EFET ✓");

  // === Full Route #2: COVID-19 Vaccine (Batch #7) ===
  console.log("\n=== Full Route #2: COVID-19 Vaccine ===");
  const transporter2 = contract.connect(signers[7]); // North Express Shipping
  const warehouse2 = contract.connect(signers[8]);    // THES Distribution Center
  const distributor2 = contract.connect(signers[9]);   // Health Pharmacy

  // Step 1: Producer → Transporter
  tx = await producer2.transferBatch(7, signers[7].address);
  await tx.wait();
  console.log("  1. Transfer to Transporter");

  // Step 2: InTransit
  tx = await transporter2.updateBatchStatus(7, STATUS.InTransit, "Egnatia Highway, Thessaloniki", "Refrigerated transport, -20°C");
  await tx.wait();
  console.log("  2. Status → InTransit");

  // Step 3: Transporter → Warehouse
  tx = await transporter2.transferBatch(7, signers[8].address);
  await tx.wait();
  console.log("  3. Transfer to Warehouse");

  // Step 4: Stored
  tx = await warehouse2.updateBatchStatus(7, STATUS.Stored, "Thessaloniki Distribution Center", "Stored in freezer -20°C");
  await tx.wait();
  console.log("  4. Status → Stored");

  // Step 5: Warehouse → Transporter
  tx = await warehouse2.transferBatch(7, signers[7].address);
  await tx.wait();
  console.log("  5. Transfer to Transporter");

  // Step 6: InTransit
  tx = await transporter2.updateBatchStatus(7, STATUS.InTransit, "Thessaloniki center", "Delivery to pharmacy");
  await tx.wait();
  console.log("  6. Status → InTransit");

  // Step 7: Transporter → Distributor
  tx = await transporter2.transferBatch(7, signers[9].address);
  await tx.wait();
  console.log("  7. Transfer to Pharmacy");

  // Step 8: Delivered
  tx = await distributor2.updateBatchStatus(7, STATUS.Delivered, "Health Pharmacy, Thessaloniki", "Vaccines received, stored at -20°C");
  await tx.wait();
  console.log("  8. Status → Delivered");

  // Step 9: Certification
  tx = await regulator.certifyBatch(7);
  await tx.wait();
  console.log("  9. Certified by EFET ✓");

  // === Save ABI + Address for frontend ===
  console.log("\n=== Saving frontend config ===");
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join("artifacts", "contracts", "SupplyChain.sol", "SupplyChain.json"),
      "utf8"
    )
  );

  const frontendConfig = {
    contractAddress: contractAddress,
    abi: artifact.abi,
    accounts: signers.slice(0, 10).map((s, i) => ({
      index: i,
      address: s.address,
    })),
  };

  fs.writeFileSync(
    path.join("frontend", "contract-config.js"),
    `// Auto-generated by deploy script\nexport const CONTRACT_CONFIG = ${JSON.stringify(frontendConfig, null, 2)};`
  );

  console.log("  ✓ frontend/contract-config.js created");
  console.log("\n=== Deployment complete! ===");
  console.log(`\nTo run the UI, open frontend/index.html in the browser.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
