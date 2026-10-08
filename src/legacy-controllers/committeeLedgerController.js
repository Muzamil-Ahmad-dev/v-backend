const { Committee, Member ,CommitteeRecord} = require("../schema/CommitteeLedgerSchema");

// Create Committee
exports.createCommittee = async (req, res) => {
    try {
        const userId = req.user.id;
        const { committeeName, totalAmount, numberOfMembers, myComitteeNameNumber, headName } = req.body;

        // Create a new committee
        const newCommittee = new Committee({
            userId,
            committeeName,
            totalAmount,
            myComitteeNameNumber,
            numberOfMembers,
            headName
        });

        await newCommittee.save();

        // Calculate monthly installment
        const monthlyInstallment = totalAmount / numberOfMembers;
        const totalMonths = totalAmount / monthlyInstallment;

        // Generate monthly records for payment tracking
        const records = [];
        for (let i = 1; i <= totalMonths; i++) {
            records.push({
                committeeId: newCommittee._id,
                monthNumber: i,
                status: "Not Paid",
                amountPaid: 0
            });
        }

        // Insert records in bulk
        await CommitteeRecord.insertMany(records);

        res.status(201).json({
            message: "Committee created successfully",
            committee: newCommittee,
            totalMonths,
            monthlyRecords: records
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.getUserCommitteeRecord = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find committees owned by the user
        const committees = await Committee.find({ userId });

        if (!committees.length) {
            return res.status(404).json({ message: "No committees found" });
        }

        // Fetch payment records for each committee
        const structuredCommittees = await Promise.all(committees.map(async (committee) => {
            const monthlyRecords = await CommitteeRecord.find({ committeeId: committee._id });

            return {
                ...committee.toObject(),
                totalMonths: monthlyRecords.length,
                monthlyRecords
            };
        }));

        return res.status(200).json({
            message: "Get all user committees",
            committees: structuredCommittees
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

//patch
exports.updateCommitteeStatus = async (req, res) => {
    try {
        const { committeeId, committeeRecordId } = req.params; // Fixed parameter naming

        // Check if the committee exists
        const committee = await Committee.findById(committeeId);
        if (!committee) {
            return res.status(404).json({ message: "Committee not found" });
        }

        // Check if the committee record exists
        const committeeRecord = await CommitteeRecord.findById(committeeRecordId);
        console.log(committeeRecord);
        
        if (!committeeRecord) {
            return res.status(404).json({ message: "Committee Record not found" });
        }

        // Calculate amount per member
        const amountPerMember = committee.totalAmount / committee.numberOfMembers;

        // Update the existing committee record
        committeeRecord.status = "Paid";
        committeeRecord.amountPaid = amountPerMember;
        await committeeRecord.save();

        // Check if all months are paid
        const totalMonths = committee.numberOfMembers; // Assuming payments are monthly
        const paidRecordsCount = await CommitteeRecord.countDocuments({ committeeId, status: "Paid" });

        // Update Committee's status
        committee.status = paidRecordsCount === totalMonths ? "Paid" : "Partially Paid";
        await committee.save();

        return res.status(200).json({
            message: `Updated month ${committeeRecord.monthNumber} successfully`,
            committee,
            committeeRecord
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
