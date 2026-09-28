using Xunit;

// The integration fixtures bootstrap one API with global Serilog state per test class.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
