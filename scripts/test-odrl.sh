#!/bin/bash

# ODRL Hybrid Policy Engine Test Runner
# This script helps run various ODRL tests and demonstrations

set -e

echo "🧪 ODRL Hybrid Policy Engine Test Suite"
echo "======================================"
echo ""

# Function to run a test with nice formatting
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo "▶️  Running: $test_name"
    echo "   Command: $test_command"
    echo ""
    
    if eval "$test_command"; then
        echo "✅ $test_name completed successfully!"
    else
        echo "❌ $test_name failed!"
        return 1
    fi
    echo ""
    echo "----------------------------------------"
    echo ""
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Parse command line arguments
case "$1" in
    "unit")
        echo "🔬 Running ODRL Unit Tests..."
        echo ""
        run_test "Parser Tests" "npm test src/odrl/__tests__/parser.test.ts"
        run_test "Evaluator Tests" "npm test src/odrl/__tests__/evaluator.test.ts"
        run_test "NL Converter Tests" "npm test src/odrl/__tests__/nl-converter.test.ts"
        ;;
    
    "integration")
        echo "🔗 Running ODRL Integration Tests..."
        echo ""
        run_test "Hybrid Policy Tests" "npm test src/odrl/__tests__/hybrid-policy-test.ts"
        run_test "API Integration Tests" "npm test src/odrl/__tests__/integration.test.ts"
        ;;
    
    "performance")
        echo "⚡ Running Performance Benchmarks..."
        echo ""
        run_test "Performance Benchmark" "npx ts-node src/odrl/__tests__/performance-benchmark.ts"
        ;;
    
    "demo")
        echo "🎯 Running ODRL Demo..."
        echo ""
        run_test "ODRL Demo" "npx ts-node examples/odrl-demo.ts"
        ;;
    
    "all")
        echo "🚀 Running All ODRL Tests..."
        echo ""
        
        # Run all test categories
        $0 unit
        $0 integration
        $0 performance
        $0 demo
        
        echo "🎉 All tests completed!"
        ;;
    
    "quick")
        echo "⚡ Running Quick ODRL Tests..."
        echo ""
        
        # Run a subset of fast tests
        run_test "ODRL Core Tests" "npm test -- --testPathPattern=odrl --testTimeout=5000"
        run_test "Quick Demo" "npx ts-node examples/odrl-demo.ts"
        ;;
    
    "server")
        echo "🚀 Starting AEGIS Server with ODRL..."
        echo ""
        echo "The server will start with ODRL hybrid policy engine enabled."
        echo "You can test the ODRL endpoints at:"
        echo "  - http://localhost:8080/odrl/policies"
        echo "  - http://localhost:8080/odrl/convert"
        echo "  - http://localhost:8080/odrl/test"
        echo ""
        npm run start:mcp:http
        ;;
    
    *)
        echo "Usage: $0 {unit|integration|performance|demo|all|quick|server}"
        echo ""
        echo "Options:"
        echo "  unit         - Run ODRL unit tests"
        echo "  integration  - Run ODRL integration tests"
        echo "  performance  - Run performance benchmarks"
        echo "  demo         - Run interactive demo"
        echo "  all          - Run all tests"
        echo "  quick        - Run quick subset of tests"
        echo "  server       - Start AEGIS server with ODRL"
        echo ""
        echo "Examples:"
        echo "  $0 quick      # Quick test to verify everything works"
        echo "  $0 demo       # See ODRL in action with examples"
        echo "  $0 all        # Run comprehensive test suite"
        exit 1
        ;;
esac

echo ""
echo "✨ Test run completed!"