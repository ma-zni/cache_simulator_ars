// Global variables
let cacheHistory = [];
let cacheConfig = {};
let accessSequence = [];
let simulationSteps = [];
let stats = [];
let currentIndex = -1;
let accessedBlocks = new Set(); // Set to track accessed blocks

// DOM elements
const configForm = document.getElementById('configForm');
const parseSequenceButton = document.getElementById('parseSequence');
const backButton = document.getElementById('backButton');
const nextButton = document.getElementById('nextButton');
const skipButton = document.getElementById('skipButton');
const resetButton = document.getElementById('resetButton');
const cacheTableBody = document.querySelector('#cacheTable tbody');
const prevCacheStateDisplay = document.getElementById('prevCacheStateDisplay');
const currCacheStateDisplay = document.getElementById('currCacheStateDisplay');
const statisticsDiv = document.getElementById('statistics');
const detailedStatistics = document.getElementById('detailedStatistics');
const toggleConfigButton = document.getElementById('toggleConfigButton');
const configContent = document.getElementById('configContent');
const toggleAccessButton = document.getElementById('toggleAccessButton');
const accessContent = document.getElementById('accessContent');

// Event listeners
configForm.addEventListener('submit', initializeCache);
parseSequenceButton.addEventListener('click', parseAccessSequence);
nextButton.addEventListener('click', showNextStep);
skipButton.addEventListener('click', showAllSteps);
backButton.addEventListener('click', showPreviousStep);
resetButton.addEventListener('click', resetSimulation);
toggleConfigButton.addEventListener('click', toggleConfigSection);
toggleAccessButton.addEventListener('click', toggleAccessSection);

// Function to toggle the Cache Configuration section
function toggleConfigSection() {
    if (configContent.style.display === 'none') {
        configContent.style.display = 'block';
        toggleConfigButton.textContent = 'Minimize';
    } else {
        configContent.style.display = 'none';
        toggleConfigButton.textContent = 'Maximize';
    }
}

// Function to toggle the Memory Access Sequence section
function toggleAccessSection() {
    if (accessContent.style.display === 'none') {
        accessContent.style.display = 'block';
        toggleAccessButton.textContent = 'Minimize';
    } else {
        accessContent.style.display = 'none';
        toggleAccessButton.textContent = 'Maximize';
    }
}

// Initialize cache based on user configuration
function initializeCache(e) {
    e.preventDefault();
    // Get user inputs
    const cacheSize = parseInt(document.getElementById('cacheSize').value);
    const blockSize = parseInt(document.getElementById('blockSize').value);
    const associativity = parseInt(document.getElementById('associativity').value);
    const replacementPolicy = document.getElementById('replacementPolicy').value;

    // Calculate number of sets
    const numberOfBlocks = Math.floor(cacheSize / blockSize);
    const numberOfSets = Math.floor(cacheSize / (associativity*blockSize));

    // Set cache configuration
    cacheConfig = {
        cacheSize,
        blockSize,
        associativity,
        replacementPolicy,
        numberOfSets
    };

    // Initialize cache structure
    cacheHistory = [];
    const initialCache = [];
    for (let i = 0; i < numberOfSets; i++) {
        initialCache.push([]);
    }
    cacheHistory.push(JSON.parse(JSON.stringify(initialCache))); // Deep copy
    // Initialize accessed blocks set
    accessedBlocks = new Set();

    // Reset statistics and simulation steps
    stats = []; // Will hold hit/miss info for each access
    simulationSteps = [];
    currentIndex = -1;

    // Disable buttons until sequence is parsed
    backButton.disabled = true;
    nextButton.disabled = true;
    skipButton.disabled = true;
    resetButton.disabled = true;
    cacheTableBody.innerHTML = '';
    prevCacheStateDisplay.textContent = '';
    currCacheStateDisplay.textContent = '';
    statisticsDiv.style.display = 'none';

    // Minimize the Cache Configuration section
    configContent.style.display = 'none';
    toggleConfigButton.textContent = 'Maximize';

    alert('Cache initialized successfully!');
}

// Parse memory access sequence
function parseAccessSequence() {
    const input = document.getElementById('accessSequence').value;
    accessSequence = [];

    try {
        // Support for loops, patterns, and new 'start-increment-end' notation
        const items = input.split(/[,;]/);
        items.forEach(item => {
            item = item.trim();
            if (/^\d+\s*-\s*\d+\s*-\s*\d+$/.test(item)) {
                // It's a start-increment-end sequence
                const parts = item.split('-').map(part => parseInt(part.trim()));
                const [start, increment, end] = parts;
                if (isNaN(start) || isNaN(increment) || isNaN(end)) {
                    throw new Error('Invalid start-increment-end notation.');
                }
                if (increment <= 0) {
                    throw new Error('Increment must be positive.');
                }
                for (let addr = start; addr <= end; addr += increment) {
                    accessSequence.push(addr);
                }
            } else if (item.startsWith('for(')) {
                // Parse for loop
                const forParts = item.match(/for\s*\(\s*(.+?)\s*;\s*(.+?)\s*;\s*(.+?)\s*\)\s*\{\s*(.+?)\s*\}/);
                if (forParts) {
                    const init = forParts[1];
                    const condition = forParts[2];
                    const increment = forParts[3];
                    const body = forParts[4];

                    // Evaluate the loop
                    const loopFunction = new Function('accessSequence', `
                        for(${init}; ${condition}; ${increment}) {
                            accessSequence.push(${body.replace('access(', '').replace(')', '')});
                        }
                    `);
                    loopFunction(accessSequence);
                } else {
                    throw new Error('Invalid for loop syntax.');
                }
            } else {
                // Parse individual address
                const addr = parseInt(item);
                if (isNaN(addr)) {
                    throw new Error(`Invalid address: ${item}`);
                }
                accessSequence.push(addr);
            }
        });

        // Validate addresses
        if (accessSequence.some(isNaN)) {
            throw new Error('Invalid memory addresses in sequence.');
        }

        // Prepare simulation steps
        prepareSimulationSteps();

        // Enable simulation controls
        nextButton.disabled = false;
        skipButton.disabled = false;
        backButton.disabled = true; // Can't go back at the start
        resetButton.disabled = false;

        // Minimize the Memory Access Sequence section
        accessContent.style.display = 'none';
        toggleAccessButton.textContent = 'Maximize';

        alert('Memory access sequence parsed successfully!');
    } catch (error) {
        alert(`Error parsing sequence: ${error.message}`);
    }
}

// Prepare simulation steps based on access sequence
function prepareSimulationSteps() {
    simulationSteps = []; // Reset in case of re-parsing
    stats = [];

    accessSequence.forEach((address, index) => {
        const step = simulateAccess(address, index + 1);
        simulationSteps.push(step);
    });
}

// Simulate a single memory access
function simulateAccess(address, accessNumber) {
    const cache = JSON.parse(JSON.stringify(cacheHistory[cacheHistory.length - 1])); // Get last cache state

    const blockSize = cacheConfig.blockSize;
    const numberOfSets = cacheConfig.numberOfSets;
    const associativity = cacheConfig.associativity;

    // Calculate block number, tag, and set index
    const blockNumber = Math.floor(address / blockSize);
    const setIndex = blockNumber % numberOfSets;
    const tag = Math.floor(blockNumber / numberOfSets);

    // Check if block is in cache
    const cacheSet = cache[setIndex];//cache is last cache state
    let block = cacheSet.find(block => block.tag === tag);

    let hitMiss = '';
    let missType = '';

    if (block) {
        // Hit
        hitMiss = 'Hit';
        block.lastUsed = accessNumber; // For LRU
    } else {
        // Miss
        // Determine the miss type
        if (!accessedBlocks.has(blockNumber)) {
            missType = 'Compulsory Miss';
        } else {
            // Determine if it's a capacity or conflict miss
            const totalCacheBlocks = cacheConfig.cacheSize / cacheConfig.blockSize;
            if (accessedBlocks.size >= totalCacheBlocks) {
                missType = 'Capacity Miss';
            } else {
                missType = 'Conflict Miss';
            }
        }

        hitMiss = missType;

        // Add the block to the accessed blocks set
        accessedBlocks.add(blockNumber);

        if (cacheSet.length < associativity) {//cacheSet is current set where block is to be added
            // Space available in set
            block = { tag, lastUsed: accessNumber }; // Removed value
            cacheSet.push(block);
        } else {
            // Replacement needed
            replaceBlock(cacheSet, tag, accessNumber);
        }
    }

    // Save the hit/miss status
    stats.push(hitMiss);

    // Save the new cache state
    cacheHistory.push(JSON.parse(JSON.stringify(cache)));
    //log cache history
    //console.log('Cache History:', cacheHistory);
    // Prepare simulation step data
    return {
        accessNumber,
        address,
        addressHex: '0x' + address.toString(16).toUpperCase(),
        binary: address.toString(2).padStart(8, '0'),
        tag,
        set: setIndex,
        hitMiss
    };
}

// Replacement policy implementation
function replaceBlock(cacheSet, tag, lastUsed) {
    const policy = cacheConfig.replacementPolicy;
    let blockToReplace;

    if (policy === 'LRU') {
        // Find the least recently used block
        blockToReplace = cacheSet.reduce((oldest, block) => {
            return block.lastUsed < oldest.lastUsed ? block : oldest;
        });
    } else if (policy === 'FIFO') {
        // Replace the first block in the set
        blockToReplace = cacheSet[0];
    } else if (policy === 'Random') {
        // Replace a random block
        const randomIndex = Math.floor(Math.random() * cacheSet.length);//can chose randomly since the whole is full
        blockToReplace = cacheSet[randomIndex];
    }

    // Replace the block
    const index = cacheSet.indexOf(blockToReplace);
    cacheSet[index] = { tag, lastUsed }; // Removed value
}

// Display the next simulation step
function showNextStep() {
    currentIndex++;
    if (currentIndex < simulationSteps.length) {
        const step = simulationSteps[currentIndex];

        // Update table
        addRowToTable(step);

        // Update cache state displays
        updateCacheStateDisplays();


        // Update buttons
        backButton.disabled = currentIndex === 0;
        if (currentIndex >= simulationSteps.length -1) {
            nextButton.disabled = true;
            skipButton.disabled = true;
            showFinalStatistics();
            //0.8s delay before alert
            setTimeout(function() {
                alert('Simulation completed. Check the statistics below.');
            }, 200);
        }

    } else {
        alert('SHOULDN\'T HAPPEN');
    }
}

// Display the previous simulation step
function showPreviousStep() {
    currentIndex--;

    if (currentIndex >= -1) {

        // Remove last row from table
        cacheTableBody.removeChild(cacheTableBody.lastChild);

        // Update cache state displays
        updateCacheStateDisplays();

        // Update buttons
        backButton.disabled = currentIndex === -1;
        nextButton.disabled = false;
        skipButton.disabled = false;

        // Hide statistics if going back from the end
        statisticsDiv.style.display = 'none';

    } else {
        alert('Already at the beginning of the simulation.');
    }
}

// Display all remaining simulation steps
function showAllSteps() {
    while (currentIndex < (simulationSteps.length-1)) {
        showNextStep();
    }
}

// Add a row to the table for a simulation step
function addRowToTable(step) {
    const row = document.createElement('tr');

    // Apply different styles based on hit/miss type
    if (step.hitMiss === 'Hit') {
        row.classList.add('hit');
    } else if (step.hitMiss === 'Compulsory Miss') {
        row.classList.add('compulsory-miss');
    } else if (step.hitMiss === 'Capacity Miss') {
        row.classList.add('capacity-miss');
    } else if (step.hitMiss === 'Conflict Miss') {
        row.classList.add('conflict-miss');
    } else {
        row.classList.add('miss');
    }

    // Create cells
    const cells = [
        step.accessNumber,
        step.addressHex,
        step.address,
        step.binary,
        step.tag,
        step.set,
        step.hitMiss
    ];

    cells.forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
    });

    cacheTableBody.appendChild(row);
}

// Update cache state displays
function updateCacheStateDisplays() {
    const prevCache = currentIndex < 0 
        ? cacheHistory[currentIndex + 1] 
        : cacheHistory[currentIndex];

    const currCache = cacheHistory[currentIndex + 1];

    prevCacheStateDisplay.textContent = formatCacheState(prevCache);
    currCacheStateDisplay.textContent = currCache ? formatCacheState(currCache) : '';
}

// Format cache state for display
function formatCacheState(cache) {
    return cache.map((set, idx) => {
        const blocks = set.map(block => ` ${block.tag}`).join(', '); // Display only tags
        return `Set ${idx}:[${blocks}]`;
    }).join('\n');
}

// Show final statistics after simulation completes
function showFinalStatistics() {
    // Calculate total hits and different miss types
    const totalHits = stats.filter(status => status === 'Hit').length;
    const compulsoryMisses = stats.filter(status => status === 'Compulsory Miss').length;
    const capacityMisses = stats.filter(status => status === 'Capacity Miss').length;
    const conflictMisses = stats.filter(status => status === 'Conflict Miss').length;
    const totalMisses = compulsoryMisses + capacityMisses + conflictMisses;
    const totalAccesses = stats.length;
    const hitRate = ((totalHits / totalAccesses) * 100).toFixed(2) + '%';
    const missRate = ((totalMisses / totalAccesses) * 100).toFixed(2) + '%';

    // Construct the statistics HTML
    let statsHtml = `
        <p>Total Accesses: ${totalAccesses}</p>
        <p>Hits: ${totalHits}</p>
        <p>Misses: ${totalMisses}</p>
        <ul>
            <li>Compulsory Misses: ${compulsoryMisses}</li>
            <li>Capacity Misses: ${capacityMisses}</li>
            <li>Conflict Misses: ${conflictMisses}</li>
        </ul>
        <p>Hit Rate: ${hitRate}</p>
        <p>Miss Rate: ${missRate}</p>
    `;

    // Display the formatted statistics
    detailedStatistics.innerHTML = statsHtml;
    statisticsDiv.style.display = 'block';
}


// Reset the simulation
function resetSimulation() {
    // Check if cache was properly initialized
    if (!cacheConfig.numberOfSets) {
        alert('Cache configuration not found. Please initialize the cache first.');
        return;
    }

    // Reset all variables
    currentIndex = -1;
    accessSequence = [];
    simulationSteps = [];
    stats = [];
    accessedBlocks = new Set();

    // Reinitialize cache structure
    cacheHistory = [];
    const initialCache = [];
    for (let i = 0; i < cacheConfig.numberOfSets; i++) {
        initialCache.push([]);
    }
    cacheHistory.push(JSON.parse(JSON.stringify(initialCache))); // Deep copy

    // Reset UI elements
    cacheTableBody.innerHTML = '';
    prevCacheStateDisplay.textContent = '';
    currCacheStateDisplay.textContent = '';
    statisticsDiv.style.display = 'none';

    // Reset buttons
    backButton.disabled = true;
    nextButton.disabled = true;
    skipButton.disabled = true;
    resetButton.disabled = true;

    alert('Simulation has been reset.');
}