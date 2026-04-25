// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title SupplyChain
 * @notice Supply chain product traceability system on blockchain.
 * @dev Implements user roles, batch registration, route tracking
 *      and certification via Regulator / Regulatory Authority.
 */
contract SupplyChain {

    // =========================================================================
    //  Enums
    // =========================================================================

    /// @notice User roles in the system
    enum Role {
        None,           // 0 - Unregistered
        Admin,          // 1 - Administrator
        Producer,       // 2 - Producer
        Transporter,    // 3 - Transporter
        Warehouse,      // 4 - Warehouse / Distribution Center
        Distributor,    // 5 - Distributor / Retailer
        Regulator       // 6 - Regulator / Regulatory Authority
    }

    /// @notice Status (stage) of a batch
    enum Status {
        Produced,       // 0 - Production
        Stored,         // 1 - Storage
        InTransit,      // 2 - In Transit
        Delivered       // 3 - Delivered to consumer / point of sale
    }

    /// @notice Product category
    enum Category {
        Perishable,     // 0 - Perishable
        NonPerishable   // 1 - Non-perishable
    }

    // =========================================================================
    //  Structs
    // =========================================================================

    /// @notice User data structure
    struct User {
        address userAddress;    // Ethereum address
        string  name;           // Username
        Role    role;           // Role
        bool    active;         // Active / inactive
    }

    /// @notice Product batch data structure
    struct Batch {
        uint256   id;              // Unique identifier
        string    productType;     // Product type (e.g. "Olive Oil")
        Category  category;        // Perishable / Non-perishable
        string    origin;          // Origin location
        uint256   creationDate;    // Creation date (block.timestamp)
        Status    status;          // Current stage
        address   currentHolder;   // Current batch holder
        bool      certified;       // Certified by Regulator
        address   producer;        // Original producer
    }

    /// @notice Checkpoint in a batch's route
    struct Checkpoint {
        uint256 timestamp;     // Timestamp
        string  location;      // Location
        address handler;       // Who performed the action
        Status  status;        // New stage
        string  notes;         // Notes
    }

    // =========================================================================
    //  State Variables
    // =========================================================================

    address public admin;                           // Admin account
    uint256 public batchCount;                      // Batch counter

    mapping(address => User)       public users;            // address → User
    mapping(uint256 => Batch)      public batches;          // batchId → Batch
    mapping(uint256 => Checkpoint[]) public batchHistory;   // batchId → Checkpoint[]

    address[] public userAddresses;                 // List of user addresses
    uint256[] public batchIds;                      // List of batch IDs

    // =========================================================================
    //  Events (Logging critical actions)
    // =========================================================================

    event UserRegistered(address indexed user, string name, Role role);
    event UserDeactivated(address indexed user);
    event BatchCreated(uint256 indexed batchId, address indexed producer, string productType);
    event BatchStatusUpdated(uint256 indexed batchId, Status newStatus, address indexed updatedBy, string location);
    event BatchTransferred(uint256 indexed batchId, address indexed from, address indexed to);
    event BatchCertified(uint256 indexed batchId, address indexed regulator);

    // =========================================================================
    //  Modifiers (Access control)
    // =========================================================================

    /// @notice Admin only
    modifier onlyAdmin() {
        require(msg.sender == admin, "Access denied: only Admin");
        _;
    }

    /// @notice Registered active user only
    modifier onlyRegistered() {
        require(users[msg.sender].active, "Access denied: not registered or inactive");
        _;
    }

    /// @notice Producer only
    modifier onlyProducer() {
        require(
            users[msg.sender].role == Role.Producer && users[msg.sender].active,
            "Access denied: only Producer"
        );
        _;
    }

    /// @notice Transporter only
    modifier onlyTransporter() {
        require(
            users[msg.sender].role == Role.Transporter && users[msg.sender].active,
            "Access denied: only Transporter"
        );
        _;
    }

    /// @notice Warehouse / Distribution Center only
    modifier onlyWarehouse() {
        require(
            users[msg.sender].role == Role.Warehouse && users[msg.sender].active,
            "Access denied: only Warehouse"
        );
        _;
    }

    /// @notice Distributor / Retailer only
    modifier onlyDistributor() {
        require(
            users[msg.sender].role == Role.Distributor && users[msg.sender].active,
            "Access denied: only Distributor"
        );
        _;
    }

    /// @notice Regulator / Regulatory Authority only
    modifier onlyRegulator() {
        require(
            users[msg.sender].role == Role.Regulator && users[msg.sender].active,
            "Access denied: only Regulator"
        );
        _;
    }

    /// @notice Current batch holder only
    modifier onlyCurrentHolder(uint256 _batchId) {
        require(batches[_batchId].currentHolder == msg.sender, "Access denied: not current holder");
        _;
    }

    // =========================================================================
    //  Constructor
    // =========================================================================

    /**
     * @notice The deployer automatically becomes Admin.
     */
    constructor() {
        admin = msg.sender;
        users[msg.sender] = User({
            userAddress: msg.sender,
            name: "Admin",
            role: Role.Admin,
            active: true
        });
        userAddresses.push(msg.sender);
        emit UserRegistered(msg.sender, "Admin", Role.Admin);
    }

    // =========================================================================
    //  User Management
    // =========================================================================

    /**
     * @notice Register a new user in the system (Admin only).
     * @param _userAddress User's Ethereum address
     * @param _name        Username
     * @param _role        Role (1-6)
     */
    function registerUser(
        address _userAddress,
        string calldata _name,
        Role _role
    ) external onlyAdmin {
        require(_userAddress != address(0), "Invalid address");
        require(_role != Role.None, "Role cannot be None");
        require(!users[_userAddress].active, "User already registered");

        users[_userAddress] = User({
            userAddress: _userAddress,
            name: _name,
            role: _role,
            active: true
        });
        userAddresses.push(_userAddress);

        emit UserRegistered(_userAddress, _name, _role);
    }

    /**
     * @notice Deactivate a user (Admin only).
     * @param _userAddress Address of the user to deactivate
     */
    function deactivateUser(address _userAddress) external onlyAdmin {
        require(users[_userAddress].active, "User not active");
        require(_userAddress != admin, "Cannot deactivate admin");
        users[_userAddress].active = false;
        emit UserDeactivated(_userAddress);
    }

    // =========================================================================
    //  Batch Management
    // =========================================================================

    /**
     * @notice Create a new batch (Producer only).
     * @param _productType Product type
     * @param _category    Category (0=Perishable, 1=Non-perishable)
     * @param _origin      Origin location
     * @return batchId     The unique ID of the new batch
     */
    function createBatch(
        string calldata _productType,
        Category _category,
        string calldata _origin
    ) external onlyProducer returns (uint256 batchId) {
        batchCount++;
        batchId = batchCount;

        batches[batchId] = Batch({
            id: batchId,
            productType: _productType,
            category: _category,
            origin: _origin,
            creationDate: block.timestamp,
            status: Status.Produced,
            currentHolder: msg.sender,
            certified: false,
            producer: msg.sender
        });
        batchIds.push(batchId);

        // First checkpoint: creation
        batchHistory[batchId].push(Checkpoint({
            timestamp: block.timestamp,
            location: _origin,
            handler: msg.sender,
            status: Status.Produced,
            notes: "Batch created by producer"
        }));

        emit BatchCreated(batchId, msg.sender, _productType);
    }

    /**
     * @notice Update batch status (current holder only, with appropriate role).
     * @param _batchId   Batch ID
     * @param _newStatus New status
     * @param _location  Location
     * @param _notes     Notes
     */
    function updateBatchStatus(
        uint256 _batchId,
        Status _newStatus,
        string calldata _location,
        string calldata _notes
    ) external onlyRegistered onlyCurrentHolder(_batchId) {
        require(_batchId > 0 && _batchId <= batchCount, "Batch does not exist");

        Batch storage batch = batches[_batchId];
        Role senderRole = users[msg.sender].role;

        // Check that the role matches the new status
        if (_newStatus == Status.Stored) {
            require(
                senderRole == Role.Warehouse || senderRole == Role.Producer,
                "Only Warehouse or Producer can set Stored"
            );
        } else if (_newStatus == Status.InTransit) {
            require(
                senderRole == Role.Transporter,
                "Only Transporter can set InTransit"
            );
        } else if (_newStatus == Status.Delivered) {
            require(
                senderRole == Role.Distributor,
                "Only Distributor can set Delivered"
            );
        }

        batch.status = _newStatus;

        batchHistory[_batchId].push(Checkpoint({
            timestamp: block.timestamp,
            location: _location,
            handler: msg.sender,
            status: _newStatus,
            notes: _notes
        }));

        emit BatchStatusUpdated(_batchId, _newStatus, msg.sender, _location);
    }

    /**
     * @notice Transfer batch to a new holder (current holder only).
     * @param _batchId    Batch ID
     * @param _newHolder  New holder address
     */
    function transferBatch(
        uint256 _batchId,
        address _newHolder
    ) external onlyRegistered onlyCurrentHolder(_batchId) {
        require(_batchId > 0 && _batchId <= batchCount, "Batch does not exist");
        require(users[_newHolder].active, "New holder is not a registered user");
        require(_newHolder != msg.sender, "Cannot transfer to yourself");

        address previousHolder = batches[_batchId].currentHolder;
        batches[_batchId].currentHolder = _newHolder;

        emit BatchTransferred(_batchId, previousHolder, _newHolder);
    }

    /**
     * @notice Certify a batch (Regulator / Regulatory Authority only).
     * @param _batchId Batch ID
     */
    function certifyBatch(uint256 _batchId) external onlyRegulator {
        require(_batchId > 0 && _batchId <= batchCount, "Batch does not exist");
        require(!batches[_batchId].certified, "Batch already certified");

        batches[_batchId].certified = true;

        batchHistory[_batchId].push(Checkpoint({
            timestamp: block.timestamp,
            location: "",
            handler: msg.sender,
            status: batches[_batchId].status,
            notes: "Certified by regulator"
        }));

        emit BatchCertified(_batchId, msg.sender);
    }

    // =========================================================================
    //  View Functions (Read data)
    // =========================================================================

    /**
     * @notice Returns the details of a batch.
     */
    function getBatch(uint256 _batchId) external view returns (Batch memory) {
        require(_batchId > 0 && _batchId <= batchCount, "Batch does not exist");
        return batches[_batchId];
    }

    /**
     * @notice Returns the checkpoint history of a batch.
     */
    function getBatchHistory(uint256 _batchId) external view returns (Checkpoint[] memory) {
        require(_batchId > 0 && _batchId <= batchCount, "Batch does not exist");
        return batchHistory[_batchId];
    }

    /**
     * @notice Returns the details of a user.
     */
    function getUser(address _userAddress) external view returns (User memory) {
        return users[_userAddress];
    }

    /**
     * @notice Returns the number of checkpoints of a batch.
     */
    function getBatchHistoryCount(uint256 _batchId) external view returns (uint256) {
        return batchHistory[_batchId].length;
    }

    /**
     * @notice Returns all batch IDs.
     */
    function getAllBatchIds() external view returns (uint256[] memory) {
        return batchIds;
    }

    /**
     * @notice Returns all user addresses.
     */
    function getAllUserAddresses() external view returns (address[] memory) {
        return userAddresses;
    }

    /**
     * @notice Returns the number of registered users.
     */
    function getUserCount() external view returns (uint256) {
        return userAddresses.length;
    }
}
