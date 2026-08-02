<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

try {
    // Get the JSON data from the request
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data) {
        throw new Exception('Invalid JSON data');
    }
    
    // Validate required fields
    $required_fields = ['filename', 'content', 'projectData'];
    foreach ($required_fields as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Missing required field: $field");
        }
    }
    
    $filename = $data['filename'];
    $content = $data['content'];
    $projectData = $data['projectData'];
    
    // Validate filename
    if (!preg_match('/^[a-zA-Z0-9\-_]+\.html$/', $filename)) {
        throw new Exception('Invalid filename format');
    }
    
    // Define the projects directory (adjust path as needed)
    $projectsDir = '../projects/';
    
    // Create projects directory if it doesn't exist
    if (!is_dir($projectsDir)) {
        if (!mkdir($projectsDir, 0755, true)) {
            throw new Exception('Failed to create projects directory');
        }
    }
    
    // Full path for the new project file
    $filepath = $projectsDir . $filename;
    
    // Save the HTML file
    if (file_put_contents($filepath, $content) === false) {
        throw new Exception('Failed to save project file');
    }
    
    // Update project database/storage
    updateProjectDatabase($projectData);
    
    // Log the successful publication
    logPublication($filename, $projectData);
    
    // Return success response
    echo json_encode([
        'success' => true,
        'message' => 'Project published successfully',
        'filename' => $filename,
        'url' => 'projects/' . $filename
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}

/**
 * Update the project database/storage
 */
function updateProjectDatabase($projectData) {
    // This function updates your project storage
    // You can implement this based on your storage method:
    // - JSON file
    // - SQL database
    // - LocalStorage (client-side)
    
    $projectsFile = '../data/projects.json';
    $projectsDir = dirname($projectsFile);
    
    // Create data directory if it doesn't exist
    if (!is_dir($projectsDir)) {
        mkdir($projectsDir, 0755, true);
    }
    
    // Load existing projects
    $projects = [];
    if (file_exists($projectsFile)) {
        $projects = json_decode(file_get_contents($projectsFile), true) ?: [];
    }
    
    // Update or add the project
    $projectId = $projectData['id'] ?? generateProjectId($projectData['title']);
    $projects[$projectId] = array_merge($projectData, [
        'id' => $projectId,
        'published' => true,
        'publishedAt' => date('Y-m-d H:i:s'),
        'url' => 'projects/' . $projectData['urlSlug'] . '.html'
    ]);
    
    // Save updated projects
    if (file_put_contents($projectsFile, json_encode($projects, JSON_PRETTY_PRINT)) === false) {
        throw new Exception('Failed to update project database');
    }
}

/**
 * Generate a unique project ID
 */
function generateProjectId($title) {
    return 'project_' . time() . '_' . substr(md5($title), 0, 8);
}

/**
 * Log the publication for audit purposes
 */
function logPublication($filename, $projectData) {
    $logFile = '../logs/publications.log';
    $logDir = dirname($logFile);
    
    // Create logs directory if it doesn't exist
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    
    $logEntry = date('Y-m-d H:i:s') . ' | ' . 
                $filename . ' | ' . 
                $projectData['title'] . ' | ' . 
                $_SERVER['REMOTE_ADDR'] . "\n";
    
    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
}
?>

