# Needs
1. Create automated test infrastructure for web applications like we create software code
2. Fetch data from a website using natural language, including when authentication is required & not providing login details to the model
3. Perform some action on a website using natural language, including when authentication is required & not providing login details to the model
4. Generate comprehensive documentation of an application in plain English.

# Additional Requirements
1. Be able to do 2 & 3 from the browser extension
2. Explore and generate page objects

# Features Completed
- Generate & update page objects (need 1)
- Explore website and document in md files (need 2, 3)
- Peform action using documentation created via explore and document process (need 2, 3)

# TODO
- (maybe) support automation for interconnections as well
- Record page objects during exploration
- Addl Requirements: 1
- Tell record page objects to not try to return next page object from it

# Key Commands
### Level 1
- self-explore (The model/agent explores the web application on its own, records everything, and saves it)
- run-instruction (The model/agent runs the user's intention in the browser, records everything, and saves it. If the user instruction requires any return data then that is returned.)

### Level 2 (Deterministic)
- extract
- ingest (for web application)

### Level 3
- document (Creates a documentation from the exploration data for human verification and any other AI usage e.g. do in layer 3. The documentation describes each page and the interconnections between them)
- generate-page-objects (Generates page objects from the exploration and run data. It can also interconnect pages based on action taken.)

### Level 4
- do (Depends on the documentation, and falls back to source run data if documentation is not sufficient, and executes user provided instructions)
- generate-workflow-functions (Generates workflow functions from the documentation, run data, and user instructions.)

## Applications
- Download website data (e.g. loyalty points statement, airlines booking history, tax returns)
- Automated functional tests
- Generate video with screenshots and transcript

## To Do
- fix record-workflow-run to support generate workflow functions
- what does where you went next means

## Documentation
- Product doc (explaining what this is, how it works, etc.)
- Architecture (overall architecture, command layers)
- User guide (different commands)
- Developer guide